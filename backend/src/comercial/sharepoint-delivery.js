import { randomUUID } from 'node:crypto';
import { HttpError } from '../auth/service.js';
import { assertCanRead, assertCanWrite } from './access.js';
import { outgoingFiles } from './crm-delivery.js';
import * as sharepoint from './sharepoint.js';

const ATTEMPT_LEASE_MS = 2 * 60_000;

export async function sharepointStatus(db, user, proposalId) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  assertCanRead(user, proposal);
  return {
    mode: sharepoint.modoDoSharePoint(),
    unavailable: sharepoint.indisponivel(),
    status: proposal.sharepointStatus,
    folder: proposal.sharepointFolder || '',
    message: proposal.sharepointError || '',
    sending: Boolean(proposal.sharepointAttemptId && proposal.sharepointAttemptAt &&
      proposal.sharepointAttemptAt.getTime() > Date.now() - ATTEMPT_LEASE_MS)
  };
}

export async function sendProposalToSharePoint(db, user, proposalId,
  { folder = '' } = {}, destination = sharepoint) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  assertCanWrite(user, proposal);
  if (proposal.archivedAt || proposal.status !== 'FINALIZADA') {
    throw new HttpError(409, 'Finalize a proposta localmente antes de enviar ao SharePoint.');
  }
  const unavailable = destination.indisponivel();
  if (unavailable) throw new HttpError(503, unavailable);
  if (proposal.sharepointStatus === 'SUCESSO' && destination.modoDoSharePoint() !== 'fake') {
    return { status: 'SUCESSO', folder: proposal.sharepointFolder,
      message: 'Esta proposta já foi enviada ao SharePoint.' };
  }

  const folderName = [proposal.proposalCode, proposal.clientName, proposal.payload?.title]
    .filter(Boolean).join(' - ');
  const existingFolder = String(folder || proposal.sharepointFolder || '').trim();
  const files = await outgoingFiles(db, proposal, {
    id: proposal.nectarPipelineId || '', nome: proposal.nectarPipelineName || ''
  });

  if (destination.modoDoSharePoint() === 'fake') {
    const result = await destination.gravarArquivos(files, {
      nomeDaPasta: folderName, pastaExistente: existingFolder
    });
    return { status: 'SIMULADO', folder: result.pasta, files: result.arquivos,
      message: 'Simulação concluída sem conexão com o SharePoint.' };
  }

  const attemptId = randomUUID();
  const claimed = await db.proposal.updateMany({
    where: { id: proposalId, status: 'FINALIZADA', sharepointStatus: { not: 'SUCESSO' },
      OR: [{ sharepointAttemptId: null },
        { sharepointAttemptAt: { lt: new Date(Date.now() - ATTEMPT_LEASE_MS) } }] },
    data: { sharepointAttemptId: attemptId, sharepointAttemptAt: new Date(),
      sharepointStatus: 'PENDENTE', sharepointError: null }
  });
  if (claimed.count !== 1) throw new HttpError(409, 'Já existe um envio ao SharePoint em andamento.');

  try {
    const result = await destination.gravarArquivos(files, {
      nomeDaPasta: folderName, pastaExistente: existingFolder
    });
    await db.proposal.updateMany({ where: { id: proposalId, sharepointAttemptId: attemptId },
      data: { sharepointStatus: 'SUCESSO', sharepointFolder: result.pasta,
        sharepointAttemptId: null, sharepointAttemptAt: null, sharepointError: null } });
    return { status: 'SUCESSO', folder: result.pasta, files: result.arquivos,
      message: 'Arquivos enviados ao SharePoint.' };
  } catch (error) {
    await db.proposal.updateMany({ where: { id: proposalId, sharepointAttemptId: attemptId },
      data: { sharepointStatus: 'ERRO', sharepointAttemptId: null,
        sharepointAttemptAt: null, sharepointError: error.message } });
    return { status: 'ERRO', folder: proposal.sharepointFolder || '', message: error.message };
  }
}
