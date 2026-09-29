import { randomUUID } from 'node:crypto';
import { ATTACHMENT_LIMITS } from '../../../shared/schemas/comercial.js';
import { HttpError } from '../auth/service.js';
import { planilhaDeCustos } from '../lib/comercial/cost-csv.js';
import { produtoDaProposta } from '../lib/comercial/nectar-produtos.js';
import { assertCanRead, assertCanWrite } from './access.js';
import { currentDocuments, describeDocuments, payloadHash } from './documents.js';
import { createNectarClient, nectarUnavailable } from './nectar.js';
import { loadFile } from './storage.js';

const ATTEMPT_LEASE_MS = 2 * 60_000;

function cleanId(value) {
  const id = String(value ?? '').trim();
  if (!/^\d+$/.test(id)) throw new HttpError(422, 'Selecione uma empresa e um contato do Nectar.');
  return id;
}

export async function crmStatus(db, user, proposalId) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  assertCanRead(user, proposal);
  return {
    status: proposal.nectarStatus,
    opportunityId: proposal.nectarOpportunityId,
    pipelineId: proposal.nectarPipelineId,
    pipelineName: proposal.nectarPipelineName,
    companyId: String(proposal.nectarCompanyId || proposal.payload?.companyId || ''),
    contactId: String(proposal.nectarContactId || proposal.payload?.contactId || ''),
    message: proposal.integrationError || '',
    sending: Boolean(proposal.nectarAttemptId && proposal.nectarAttemptAt &&
      proposal.nectarAttemptAt.getTime() > Date.now() - ATTEMPT_LEASE_MS)
  };
}

export async function outgoingFiles(db, proposal, funnel) {
  const docs = await currentDocuments(db, proposal.id);
  if (docs.length !== 4 || docs.some(item => item.payloadHash !== payloadHash(proposal))) {
    throw new HttpError(409, 'Emita os documentos atualizados antes de enviar ao CRM.');
  }
  const pdfs = docs.filter(item => item.format === 'PDF');
  if (pdfs.length !== 2) throw new HttpError(409, 'Os dois PDFs da proposta não estão disponíveis.');
  const described = describeDocuments(proposal, pdfs);
  const files = await Promise.all(pdfs.map(async (item, index) => ({
    fileName: described[index].fileName, bytes: await loadFile(item.storagePath)
  })));

  if (proposal.costEstimateId) {
    const estimate = await db.costEstimate.findUnique({ where: { id: proposal.costEstimateId } });
    if (estimate) files.push(planilhaDeCustos(estimate, {
      proposalCode: proposal.proposalCode,
      sellerName: proposal.sellerName,
      estimatorName: proposal.estimatorName,
      pipelineId: funnel.id,
      pipelineName: funnel.nome
    }));
  }

  const attachments = await db.proposalAttachment.findMany({
    where: { proposalId: proposal.id }, orderBy: { createdAt: 'asc' }
  });
  for (const item of attachments) {
    files.push({ fileName: item.originalName, bytes: await loadFile(item.storagePath) });
  }
  const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
  if (total > ATTACHMENT_LIMITS.maxAggregateBytes) {
    throw new HttpError(413, 'Os PDFs, a planilha e os anexos ultrapassam 20 MB.');
  }
  return files;
}

export async function sendProposalToCrm(db, user, proposalId, input, crm = createNectarClient()) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  assertCanWrite(user, proposal);
  if (proposal.archivedAt || proposal.status !== 'FINALIZADA') {
    throw new HttpError(409, 'Finalize a proposta localmente antes de enviar ao Nectar.');
  }
  if (proposal.nectarStatus === 'SUCESSO' && crm.config.mode !== 'fake') {
    return { status: 'SUCESSO', opportunityId: proposal.nectarOpportunityId,
      pipelineId: proposal.nectarPipelineId, pipelineName: proposal.nectarPipelineName,
      message: 'Esta proposta já foi enviada ao Nectar.' };
  }
  const unavailable = nectarUnavailable(crm.config);
  if (unavailable) throw new HttpError(503, unavailable);

  const funnels = (await crm.funnels()).items;
  const selectedPipeline = String(input.pipelineId || proposal.nectarPipelineId || '').trim();
  const funnel = funnels.find(item => item.id === selectedPipeline);
  if (!funnel) throw new HttpError(422, 'Selecione um funil autorizado do Nectar.');
  if (proposal.nectarOpportunityId && proposal.nectarPipelineId &&
      proposal.nectarPipelineId !== funnel.id) {
    throw new HttpError(409, 'Esta proposta já está vinculada a um card de outro funil.');
  }

  const companyId = cleanId(input.companyId || proposal.nectarCompanyId || proposal.payload?.companyId);
  const contactId = cleanId(input.contactId || proposal.nectarContactId || proposal.payload?.contactId);
  if (proposal.nectarOpportunityId && (
    proposal.nectarCompanyId && proposal.nectarCompanyId !== companyId ||
    proposal.nectarContactId && proposal.nectarContactId !== contactId
  )) {
    throw new HttpError(409, 'Esta proposta já está vinculada a outro cliente ou contato no card do Nectar.');
  }
  const company = await crm.companyDetails(companyId);
  if (!company.contatos.some(item => item.id === contactId)) {
    throw new HttpError(422, 'O contato selecionado não pertence à empresa escolhida no Nectar.');
  }
  const payload = proposal.payload && typeof proposal.payload === 'object' ? proposal.payload : {};
  const technicalServices = Array.isArray(payload.technicalServices) ? payload.technicalServices : [];
  produtoDaProposta(technicalServices, Number(proposal.totalValue));
  const files = await outgoingFiles(db, proposal, funnel);
  const data = {
    proposalCode: proposal.revisionNumber
      ? `${proposal.proposalCode} Rev ${proposal.revisionNumber}` : proposal.proposalCode,
    clientName: proposal.clientName,
    title: String(payload.title || ''),
    site: proposal.site,
    contactName: proposal.contact,
    contactEmail: proposal.email,
    companyId, contactId,
    totalValue: Number(proposal.totalValue),
    technicalServices
  };

  if (crm.config.mode === 'fake') {
    const opportunity = proposal.nectarOpportunityId
      ? { id: proposal.nectarOpportunityId } : await crm.createOpportunity(data, funnel);
    await crm.attach(opportunity.id, files, data, funnel);
    return { status: 'SIMULADO', opportunityId: opportunity.id, pipelineId: funnel.id,
      pipelineName: funnel.nome, attached: files.length,
      message: 'Simulação concluída sem conexão com o Nectar. Nenhum envio foi marcado como concluído.' };
  }

  const attemptId = randomUUID();
  const claimed = await db.proposal.updateMany({
    where: { id: proposalId, status: 'FINALIZADA', nectarStatus: { not: 'SUCESSO' }, OR: [
      { nectarAttemptId: null },
      { nectarAttemptAt: { lt: new Date(Date.now() - ATTEMPT_LEASE_MS) } }
    ] },
    data: { nectarAttemptId: attemptId, nectarAttemptAt: new Date(),
      nectarCompanyId: companyId, nectarContactId: contactId,
      nectarPipelineId: funnel.id, nectarPipelineName: funnel.nome,
      nectarStatus: 'PENDENTE', integrationError: null }
  });
  if (claimed.count !== 1) throw new HttpError(409, 'Já existe um envio ao Nectar em andamento.');

  let opportunityId = proposal.nectarOpportunityId;
  try {
    if (!opportunityId) {
      const created = await crm.createOpportunity(data, funnel);
      opportunityId = created.id;
      const saved = await db.proposal.updateMany({
        where: { id: proposalId, nectarAttemptId: attemptId },
        data: { nectarOpportunityId: opportunityId }
      });
      if (saved.count !== 1) throw new HttpError(409, 'O envio ao Nectar perdeu a reserva desta proposta.');
    }
    await crm.attach(opportunityId, files, data, funnel);
    await db.proposal.updateMany({ where: { id: proposalId, nectarAttemptId: attemptId },
      data: { nectarStatus: 'SUCESSO', nectarAttemptId: null, nectarAttemptAt: null,
        nectarOpportunityId: opportunityId, integrationError: null } });
    return { status: 'SUCESSO', opportunityId, pipelineId: funnel.id,
      pipelineName: funnel.nome, attached: files.length, message: 'Proposta enviada ao Nectar.' };
  } catch (error) {
    await db.proposal.updateMany({ where: { id: proposalId, nectarAttemptId: attemptId },
      data: { nectarStatus: 'ERRO', nectarAttemptId: null, nectarAttemptAt: null,
        integrationError: error.message } });
    return { status: 'ERRO', opportunityId, pipelineId: funnel.id,
      pipelineName: funnel.nome, message: error.message };
  }
}
