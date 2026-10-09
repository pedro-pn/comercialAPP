import { HttpError } from '../auth/service.js';
import { releaseForProposal } from './crm-releases.js';
import { lerDinheiro, somarDinheiro } from '../../../shared/comercial/dist/dinheiro.js';
import { descontosDaProposta, precosComDescontos } from '../../../shared/comercial/dist/proposal-pricing.js';
import { assertCanRead, assertCanWrite, assertVersion, ConcurrentWriteError, ownerFilter } from './access.js';
import { assertReservedCode, markNumberUsed } from './numbering.js';
import { describeDocuments } from './documents.js';
import { resolveSeller } from './consultants.js';

export function calculateProposalTotal(payload) {
  const prices = precosComDescontos(Array.isArray(payload?.prices) ? payload.prices : [],
    descontosDaProposta(payload ?? {}));
  if (!prices.length) return 0;
  if (payload?.modelo === 'padrao') return somarDinheiro(prices.map(item => item?.value));
  const byScenario = new Map();
  for (const item of prices) {
    const scenario = item?.local || '';
    byScenario.set(scenario, (byScenario.get(scenario) ?? 0) + Math.round(lerDinheiro(item?.value) * 100));
  }
  if (byScenario.size === 1) return [...byScenario.values()][0] / 100;
  const selected = String(payload?.priceScenario || '').trim().toUpperCase();
  if (selected && byScenario.has(selected)) return byScenario.get(selected) / 100;
  return Math.max(...byScenario.values()) / 100;
}

async function validateEstimateLink(db, user, id, proposalCode) {
  if (!id) return null;
  const estimate = await db.costEstimate.findUnique({ where: { id } });
  if (!estimate) throw new HttpError(422, 'O levantamento vinculado não foi encontrado.');
  assertCanRead(user, estimate);
  if (estimate.archivedAt || estimate.status !== 'SALVO') {
    throw new HttpError(422, 'Salve e desarquive o levantamento antes de vincular a proposta.');
  }
  if (estimate.proposalCode !== proposalCode) {
    throw new HttpError(422, 'O levantamento vinculado usa outro código de proposta.');
  }
  return estimate.id;
}

function completarClientePrisma(proposta, snapshot) {
  const cliente = {}, campos = {};
  for (const [coluna, campo, origem] of [
    ['clientName', 'client', 'legalName'], ['cnpj', 'cnpj', 'taxId'],
    ['contact', 'contact', 'contactName'], ['email', 'email', 'email'],
    ['department', 'department', 'department'], ['site', 'site', 'site']
  ]) {
    if (String(proposta[coluna] || '').trim()) continue;
    const valor = String(proposta.payload?.[campo] || '').trim() || String(snapshot[origem] || '').trim();
    if (!valor) continue;
    cliente[coluna] = valor;
    campos[campo] = valor;
  }
  if (!String(proposta.payload?.title || '').trim() && snapshot.description?.trim()) {
    campos.title = snapshot.description.trim();
  }
  return { ...cliente, ...(Object.keys(campos).length ? { payload: { ...proposta.payload, ...campos } } : {}) };
}

function historyItem(item, viewer) {
  const generationId = item.documents?.[0]?.generationId;
  const current = generationId
    ? item.documents.filter(document => document.generationId === generationId) : [];
  const output = {
    id: item.id,
    proposalCode: item.proposalCode,
    revisionNumber: item.revisionNumber,
    status: item.status,
    clientName: item.clientName,
    contact: item.contact,
    email: item.email,
    site: item.site,
    sellerName: item.sellerName,
    estimatorName: item.estimatorName,
    title: typeof item.payload?.title === 'string' ? item.payload.title : '',
    finalizedAt: item.finalizedAt,
    archivedAt: item.archivedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    documents: describeDocuments(item,
      viewer ? current.filter(document => document.kind === 'TECNICA') : current)
  };
  if (viewer) return output;
  return {
    ...output,
    costEstimateId: item.costEstimateId,
    sellerUserId: item.sellerUserId,
    sellerConsultantId: item.sellerConsultantId,
    totalValue: item.totalValue,
    totalCost: item.costEstimate?.totalCost ?? null,
    marginPercent: item.costEstimate?.marginPercent ?? null,
    crmReleaseId: item.crmReleaseId,
    prismaDeliveryStatus: item.prismaDeliveryStatus,
    nectarStatus: item.nectarStatus,
    nectarOpportunityId: item.nectarOpportunityId,
    nectarPipelineId: item.nectarPipelineId,
    nectarPipelineName: item.nectarPipelineName,
    sharepointStatus: item.sharepointStatus,
    sharepointFolder: item.sharepointFolder,
    crmApprovalStatus: item.crmApprovalStatus,
    crmProjectId: item.crmProjectId,
    filtroStatus: item.filtroStatus,
    integrationError: item.integrationError
  };
}

export async function listProposals(db, user, filters) {
  const term = filters.busca;
  const where = {
    ...(user.role === 'VIEWER' ? {} : ownerFilter(user)),
    archivedAt: filters.arquivados ? { not: null } : null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(term ? { OR: [
      { proposalCode: { contains: term, mode: 'insensitive' } },
      { clientName: { contains: term, mode: 'insensitive' } },
      { contact: { contains: term, mode: 'insensitive' } },
      { site: { contains: term, mode: 'insensitive' } }
    ] } : {})
  };
  const [total, items] = await Promise.all([
    db.proposal.count({ where }),
    db.proposal.findMany({
      where,
      orderBy: [{ [filters.status === 'RASCUNHO' ? 'updatedAt' : 'createdAt']: 'desc' }, { revisionNumber: 'desc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        costEstimate: { select: { totalCost: true, marginPercent: true } },
        documents: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }
      }
    })
  ]);
  return { items: items.map(item => historyItem(item, user.role === 'VIEWER')), total };
}

export async function getProposal(db, user, id) {
  const proposal = await db.proposal.findUnique({ where: { id } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  if (user.role === 'VIEWER') throw new HttpError(403, 'Acesso restrito a gestores e vendedores.');
  assertCanRead(user, proposal);
  return proposal;
}

export async function prepareRevision(db, user, proposalCode) {
  const previous = await db.proposal.findMany({
    where: { proposalCode, ...ownerFilter(user) },
    orderBy: { revisionNumber: 'desc' }
  });
  if (!previous.length) throw new HttpError(404, 'Proposta não encontrada no histórico.');
  const latest = previous[0];
  const withSnapshot = previous.find(item => item.payload && Object.keys(item.payload).length);
  const withCrm = previous.find(item => item.nectarOpportunityId);
  return {
    base_number: Number(proposalCode),
    baseNumber: Number(proposalCode),
    proposalCode,
    nextRevision: latest.revisionNumber + 1,
    snapshot: withSnapshot?.payload ?? {},
    snapshotAvailable: Boolean(withSnapshot),
    message: withSnapshot ? 'Proposta anterior carregada por completo.' : 'Sem snapshot completo.',
    crmReleaseId: latest.crmReleaseId,
    costEstimateId: latest.costEstimateId,
    sellerUserId: latest.sellerUserId,
    sellerConsultantId: latest.sellerConsultantId,
    sellerName: latest.sellerName,
    crm: withCrm ? {
      opportunityId: withCrm.nectarOpportunityId,
      pipelineId: withCrm.nectarPipelineId ?? '',
      pipelineName: withCrm.nectarPipelineName ?? ''
    } : null
  };
}

export async function createProposal(db, user, data) {
  const reservation = await assertReservedCode(db, user, data.proposalCode, data.revisionNumber);
  const previous = data.revisionNumber > 0 &&
    reservation.legacyFirstRevision !== data.revisionNumber
    ? await prepareRevision(db, user, data.proposalCode) : null;
  if (previous && previous.nextRevision !== data.revisionNumber) {
    throw new HttpError(409, `A próxima revisão é ${previous.nextRevision}.`);
  }
  const costEstimateId = await validateEstimateLink(db, user, data.costEstimateId, data.proposalCode);
  const releaseId = data.crmReleaseId || previous?.crmReleaseId;
  if (previous?.crmReleaseId && releaseId !== previous.crmReleaseId) {
    throw new HttpError(409, 'A revisão deve preservar a liberação original.');
  }
  const release = releaseId ? await releaseForProposal(db, releaseId) : null;
  const seller = !data.sellerUserId && !data.sellerConsultantId
    ? { sellerUserId: null, sellerConsultantId: null, sellerName: '' }
    : await resolveSeller(db, data.sellerUserId, data.sellerConsultantId,
      { previousSeller: previous });
  const totalValue = calculateProposalTotal(data.payload);
  if (!Number.isFinite(totalValue)) throw new HttpError(422, 'Valor da proposta inválido.');
  if (totalValue < 0) throw new HttpError(422, 'Os descontos não podem ultrapassar o total dos itens de preço.');
  try {
    return await db.$transaction(async tx => {
      let clientePrisma = {};
      if (release) {
        await tx.$queryRaw`SELECT "id" FROM "CrmRelease" WHERE "id" = ${release.id} FOR SHARE`;
        const currentRelease = await releaseForProposal(tx, release.id);
        if (currentRelease.version !== release.version) {
          throw new HttpError(409, 'Liberação atualizada; recarregue antes de criar a proposta.');
        }
        const cnpj = String(data.cnpj || '').trim() || String(data.payload?.cnpj || '').trim();
        if (cnpj && cnpj.replace(/\D/g, '') !== currentRelease.snapshot.taxId) {
          throw new HttpError(409, 'A liberação do Prisma pertence a outro CNPJ.');
        }
        // A criação também completa os contatos; não depende de o navegador
        // ter terminado de aplicar todos os dados da liberação.
        clientePrisma = completarClientePrisma(data, currentRelease.snapshot);
      }
      const proposal = await tx.proposal.create({
        data: {
          ...(release ? {
            crmReleaseId: release.id, crmOpportunityId: release.opportunityId,
            crmClientId: release.clientId, prismaProjectId: release.prismaProjectId
          } : {}),
          proposalCode: data.proposalCode,
          revisionNumber: data.revisionNumber,
          costEstimateId,
          clientName: data.clientName,
          cnpj: data.cnpj,
          contact: data.contact,
          email: data.email,
          site: data.site,
          department: data.department ?? null,
          ...seller,
          estimatorName: user.name,
          payload: data.payload,
          totalValue,
          ...clientePrisma,
          createdByUserId: user.id,
          nectarOpportunityId: previous?.crm?.opportunityId ?? null,
          nectarPipelineId: previous?.crm?.pipelineId ?? null,
          nectarPipelineName: previous?.crm?.pipelineName ?? null
        }
      });
      await markNumberUsed(tx, Number(data.proposalCode));
      return proposal;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new HttpError(409, 'Já existe uma proposta com este código e revisão.');
    }
    throw error;
  }
}

export async function updateProposal(db, user, id, data) {
  const existing = await getProposal(db, user, id);
  assertCanWrite(user, existing);
  if (existing.archivedAt || existing.status !== 'RASCUNHO') {
    throw new HttpError(409, 'A proposta não aceita mais edições.');
  }
  if (data.proposalCode && data.proposalCode !== existing.proposalCode ||
      data.revisionNumber !== undefined && data.revisionNumber !== existing.revisionNumber) {
    throw new HttpError(409, 'Código e revisão não podem ser alterados.');
  }
  const protectVersion = assertVersion(existing, data.expectedUpdatedAt, data.forceOverwrite);
  // Editar custos pode devolver o levantamento a rascunho. A proposta mantém
  // seu vínculo existente; a conclusão é exigida ao criar ou trocar o vínculo.
  const costEstimateId = data.costEstimateId === undefined || data.costEstimateId === existing.costEstimateId
    ? existing.costEstimateId
    : await validateEstimateLink(db, user, data.costEstimateId, existing.proposalCode);
  const seller = data.sellerUserId === undefined && data.sellerConsultantId === undefined
    ? { sellerUserId: existing.sellerUserId, sellerConsultantId: existing.sellerConsultantId,
        sellerName: existing.sellerName }
    : !data.sellerUserId && !data.sellerConsultantId
      ? { sellerUserId: null, sellerConsultantId: null, sellerName: '' }
      : await resolveSeller(db, data.sellerUserId, data.sellerConsultantId, { previousSeller: existing });
  const payload = data.payload ?? existing.payload;
  const totalValue = calculateProposalTotal(payload);
  if (!Number.isFinite(totalValue)) throw new HttpError(422, 'Valor da proposta inválido.');
  if (totalValue < 0) throw new HttpError(422, 'Os descontos não podem ultrapassar o total dos itens de preço.');
  try {
    return await db.proposal.update({
      where: protectVersion ? { id, updatedAt: existing.updatedAt } : { id },
      data: {
        costEstimateId,
        clientName: data.clientName ?? existing.clientName,
        cnpj: data.cnpj ?? existing.cnpj,
        contact: data.contact ?? existing.contact,
        email: data.email ?? existing.email,
        site: data.site ?? existing.site,
        department: data.department === undefined ? existing.department : data.department,
        ...seller,
        payload,
        totalValue,
        updatedByUserId: user.id,
        updatedByLabel: user.name,
        updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))
      }
    });
  } catch (error) {
    if (protectVersion && error.code === 'P2025') {
      const current = await db.proposal.findUnique({ where: { id } });
      if (current) throw new ConcurrentWriteError(current);
    }
    throw error;
  }
}

/** Associa um rascunho existente sem substituir conteúdo, documentos ou numeração. */
export async function linkProposalToPrisma(db, user, id, data) {
  await getProposal(db, user, id);
  try {
    return await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${id} FOR UPDATE`;
      const existing = await getProposal(tx, user, id);
      assertCanWrite(user, existing);
      if (existing.archivedAt || existing.status !== 'RASCUNHO') {
        throw new HttpError(409, 'Reabra a proposta para edição antes de vincular ao Prisma.');
      }
      if (existing.crmReleaseId) {
        if (existing.crmReleaseId === data.crmReleaseId) return existing;
        throw new HttpError(409, 'Esta proposta já está vinculada a outro negócio do Prisma.');
      }
      assertVersion(existing, data.expectedUpdatedAt, false);
      if (existing.prismaReceivedId || existing.prismaDeliveryAttempts > 0 ||
          ['SUCESSO', 'ENVIANDO'].includes(existing.prismaDeliveryStatus) ||
          existing.crmApprovalAt || existing.crmStatusSequence > 0 ||
          (existing.crmApprovalStatus && existing.crmApprovalStatus !== 'PENDENTE')) {
        throw new HttpError(409, 'A proposta já possui envio ou decisão registrada; o vínculo não pode ser alterado.');
      }
      await tx.$queryRaw`SELECT "id" FROM "CrmRelease" WHERE "id" = ${data.crmReleaseId} FOR SHARE`;
      const release = await releaseForProposal(tx, data.crmReleaseId);
      if (release.version !== data.expectedReleaseVersion) {
        throw new HttpError(409, 'Liberação atualizada; recarregue os negócios antes de vincular.');
      }
      const cnpj = String(existing.cnpj || '').trim() || String(existing.payload?.cnpj || '').trim();
      const taxId = cnpj.replace(/\D/g, '');
      if (cnpj && taxId.length !== 14) {
        throw new HttpError(422, 'Complete ou corrija o CNPJ da proposta antes de vincular ao Prisma.');
      }
      if (cnpj && taxId !== release.snapshot.taxId) {
        throw new HttpError(409, 'O negócio do Prisma pertence a outro CNPJ. Selecione um negócio do mesmo cliente.');
      }
      if (existing.crmOpportunityId && existing.crmOpportunityId !== release.opportunityId) {
        throw new HttpError(409, 'A proposta já possui vínculo com outra oportunidade.');
      }
      const newer = await tx.proposal.findFirst({ where: {
        proposalCode: existing.proposalCode, revisionNumber: { gt: existing.revisionNumber }
      } });
      if (newer) throw new HttpError(409, 'Vincule a revisão mais recente desta proposta.');
      const otherLink = await tx.proposal.findFirst({ where: {
        proposalCode: existing.proposalCode,
        crmReleaseId: { not: null, notIn: [release.id] }
      } });
      if (otherLink) throw new HttpError(409, 'Outra revisão desta proposta está vinculada a outro negócio do Prisma.');
      // Complete os dados do cliente ausentes nas colunas e no snapshot, sem
      // substituir contatos, locais ou conteúdo que já foram preenchidos.
      return await tx.proposal.update({
        where: { id, status: 'RASCUNHO', archivedAt: null,
          crmReleaseId: null, updatedAt: existing.updatedAt },
        data: {
          crmReleaseId: release.id, crmClientId: release.clientId,
          crmOpportunityId: release.opportunityId, prismaProjectId: release.prismaProjectId,
          ...completarClientePrisma(existing, release.snapshot),
          updatedByUserId: user.id, updatedByLabel: user.name,
          updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))
        }
      });
    });
  } catch (error) {
    if (error.code === 'P2025') {
      const current = await db.proposal.findUnique({ where: { id } });
      if (current) throw new ConcurrentWriteError(current);
    }
    throw error;
  }
}

/** Reabre o mesmo registro, preservando numeração, vínculos e arquivos emitidos. */
export async function reopenProposal(db, user, id, data) {
  const existing = await getProposal(db, user, id);
  assertCanWrite(user, existing);
  if (existing.archivedAt || existing.status !== 'FINALIZADA') {
    throw new HttpError(409, 'Somente propostas finalizadas e ativas podem ser reabertas para edição.');
  }
  assertVersion(existing, data.expectedUpdatedAt, false);
  try {
    return await db.proposal.update({
      where: { id, status: 'FINALIZADA', archivedAt: null, updatedAt: existing.updatedAt },
      data: {
        status: 'RASCUNHO',
        finalizedAt: null,
        updatedByUserId: user.id,
        updatedByLabel: user.name,
        updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))
      }
    });
  } catch (error) {
    if (error.code === 'P2025') {
      const current = await db.proposal.findUnique({ where: { id } });
      if (current) throw new ConcurrentWriteError(current);
    }
    throw error;
  }
}

export async function archiveProposal(db, user, id, archive) {
  const existing = await getProposal(db, user, id);
  assertCanWrite(user, existing);
  return db.proposal.update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
}
