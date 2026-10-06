import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from '../auth/service.js';
import { currentDocuments } from './documents.js';
import { loadFile, safeCode } from './storage.js';

const LEASE_MS = 90_000;
const MAX_ATTEMPTS = 10;
const MAX_PDF_BYTES = 10_000_000;

function prismaEndpoint(env = process.env) {
  let base;
  try { base = new URL(env.PRISMA_API_URL); }
  catch { throw new HttpError(503, 'Endpoint Prisma inválido.'); }
  const pathname = base.pathname.replace(/\/$/, '');
  const local = base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)
    && env.NODE_ENV !== 'production' && env.APP_ENV !== 'production';
  if (base.username || base.password || base.search || base.hash
    || !/^\/api\/comercialapp\/v2\/(production|sandbox)$/.test(pathname)
    || !(local || base.protocol === 'https:' && base.hostname === 'prismacrm.filtrovali.com.br')) {
    throw new HttpError(503, 'Endpoint Prisma inválido.');
  }
  if (env.APP_ENV === 'staging' && !pathname.endsWith('/sandbox')) {
    throw new HttpError(503, 'Staging requer o receptor sandbox do Prisma.');
  }
  return `${base.origin}${pathname}/revisions`;
}

function requestKey(proposal) {
  const hex = createHash('sha256').update(`prisma-finalized:${proposal.id}:${proposal.revisionNumber}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function retryAfterDate(response) {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  const milliseconds = /^\d+$/.test(value) ? Date.now() + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(milliseconds) && milliseconds > Date.now() ? milliseconds : null;
}

export async function sendFinalizedToPrisma(db, id, transport = fetch, { automatic = false } = {}) {
  const proposal = await db.proposal.findUnique({ where: { id } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  if (!proposal.crmReleaseId) return { status: 'SEM_LIBERACAO' };
  if (proposal.status !== 'FINALIZADA') throw new HttpError(409, 'Proposta ainda não finalizada.');
  if (proposal.prismaDeliveryStatus === 'SUCESSO') return { status: 'SUCESSO', id: proposal.prismaReceivedId };
  if (!process.env.PRISMA_API_URL || !process.env.PRISMA_API_TOKEN) return { status: 'DESATIVADO' };
  const endpoint = prismaEndpoint();
  const attemptId = randomUUID();
  const claimed = await db.proposal.updateMany({
    where: {
      id, status: 'FINALIZADA', prismaDeliveryStatus: { not: 'SUCESSO' },
      ...(automatic ? { prismaDeliveryAttempts: { lt: MAX_ATTEMPTS } } : {}),
      OR: [{ prismaDeliveryAttemptAt: null }, { prismaDeliveryAttemptAt: { lt: new Date(Date.now() - LEASE_MS) } }]
    },
    data: {
      prismaDeliveryAttemptId: attemptId, prismaDeliveryAttemptAt: new Date(),
      prismaDeliveryStatus: 'ENVIANDO', prismaDeliveryAttempts: { increment: 1 },
      prismaDeliveryNextRetryAt: null
    }
  });
  if (claimed.count !== 1) return { status: 'EM_ENVIO' };
  try {
    const docs = proposal.prismaDeliveryGenerationId
      ? await db.proposalDocument.findMany({ where: {
        proposalId: id, generationId: proposal.prismaDeliveryGenerationId, format: 'PDF'
      } })
      : (await currentDocuments(db, id)).filter(item => item.format === 'PDF');
    if (docs.length !== 2 || !docs.some(item => item.kind === 'TECNICA')
      || !docs.some(item => item.kind === 'COMERCIAL')) {
      throw new HttpError(409, 'Dois PDFs da mesma geração são obrigatórios.');
    }
    const form = new FormData();
    form.set('metadata', JSON.stringify({
      contractVersion: 2, releaseId: proposal.crmReleaseId, clientId: proposal.crmClientId,
      opportunityId: proposal.crmOpportunityId, prismaProjectId: proposal.prismaProjectId,
      proposalId: proposal.id, proposalCode: proposal.proposalCode,
      revisionNumber: proposal.revisionNumber, amountBrl: String(proposal.totalValue)
    }));
    for (const doc of docs) {
      const bytes = await loadFile(doc.storagePath);
      if (bytes.length > MAX_PDF_BYTES) throw new HttpError(413, 'PDF excede o limite Prisma de 10 MB.');
      if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new HttpError(415, 'Arquivo não é um PDF válido.');
      form.set(doc.kind === 'TECNICA' ? 'technical_pdf' : 'commercial_pdf',
        new Blob([bytes], { type: 'application/pdf' }),
        `${safeCode(proposal.proposalCode)}-rev-${proposal.revisionNumber}-${doc.kind.toLowerCase()}.pdf`);
    }
    // Uma confirmação perdida deve reenviar os mesmos PDFs, mesmo após regeneração local.
    const pinned = await db.proposal.updateMany({
      where: { id, prismaDeliveryAttemptId: attemptId },
      data: { prismaDeliveryGenerationId: docs[0].generationId }
    });
    if (pinned.count !== 1) return { status: 'EM_ENVIO' };
    const response = await transport(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${process.env.PRISMA_API_TOKEN}`, 'Idempotency-Key': requestKey(proposal) },
      body: form
    });
    if (!response.ok) {
      throw Object.assign(new Error(`PRISMA_HTTP_${response.status}`), {
        status: response.status, retryAfter: retryAfterDate(response),
        // Uma rejeição de formato não criou revisão e permite corrigir os PDFs antes do reenvio.
        resetGeneration: [400, 413, 415].includes(response.status)
      });
    }
    const body = await response.json();
    if (typeof body.id !== 'string' || !body.id
      || body.releaseId !== proposal.crmReleaseId || body.opportunityId !== proposal.crmOpportunityId
      || body.proposalId !== proposal.id || body.proposalCode !== proposal.proposalCode
      || body.revisionNumber !== proposal.revisionNumber) {
      throw new Error('PRISMA_INVALID_ACK');
    }
    const updated = await db.proposal.updateMany({
      where: { id, prismaDeliveryAttemptId: attemptId },
      data: {
        prismaDeliveryStatus: 'SUCESSO', prismaReceivedId: body.id,
        prismaDeliveryError: null, prismaDeliveryAttemptId: null,
        prismaDeliveryAttemptAt: null, prismaDeliveryNextRetryAt: null
      }
    });
    return updated.count === 1 ? { status: 'SUCESSO', id: body.id } : { status: 'EM_ENVIO' };
  } catch (error) {
    const retryable = !error.status || [408, 425, 429].includes(error.status) || error.status >= 500;
    const attempts = proposal.prismaDeliveryAttempts + 1;
    const backoff = Math.min(3_600_000, 60_000 * 2 ** Math.min(attempts - 1, 6));
    await db.proposal.updateMany({
      where: { id, prismaDeliveryAttemptId: attemptId },
      data: {
        prismaDeliveryStatus: 'ERRO',
        prismaDeliveryError: /^PRISMA_[A-Z_0-9]+$/.test(error.message) ? error.message : `PRISMA_DELIVERY_FAILED${error.status ? `_${error.status}` : ''}`,
        prismaDeliveryAttemptId: null, prismaDeliveryAttemptAt: null,
        ...(error.resetGeneration ? { prismaDeliveryGenerationId: null } : {}),
        prismaDeliveryNextRetryAt: retryable && attempts < MAX_ATTEMPTS
          ? new Date(Math.max(Date.now() + backoff, error.retryAfter || 0)) : null
      }
    });
    return { status: 'ERRO' };
  }
}

export async function retryPendingPrisma(db, transport = fetch) {
  if (!process.env.PRISMA_API_URL || !process.env.PRISMA_API_TOKEN) return 0;
  const rows = await db.proposal.findMany({
    where: {
      status: 'FINALIZADA', crmReleaseId: { not: null },
      prismaDeliveryStatus: { not: 'SUCESSO' }, prismaDeliveryAttempts: { lt: MAX_ATTEMPTS },
      OR: [
        { prismaDeliveryStatus: 'PENDENTE' },
        { prismaDeliveryNextRetryAt: { lte: new Date() } },
        { prismaDeliveryAttemptAt: { lt: new Date(Date.now() - LEASE_MS) } }
      ]
    },
    orderBy: { updatedAt: 'asc' }, take: 10
  });
  for (const proposal of rows) await sendFinalizedToPrisma(db, proposal.id, transport, { automatic: true });
  return rows.length;
}
