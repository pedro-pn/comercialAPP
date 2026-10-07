import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../auth/service.js';
import { currentDocuments, describeDocuments, payloadHash } from './documents.js';
import { estimateForFinalizedProposal } from './finalized-estimate.js';
import { loadFile } from './storage.js';

const MAX_PDF_BYTES = 10_000_000;
const referenceSchema = z.object({
  code: z.string().trim().regex(/^\d{1,40}$/),
  revision: z.coerce.number().int().min(0).max(2_147_483_647)
});

export function requireFiltroExportToken(request, _response, next) {
  const expected = process.env.FILTROAPP_API_TOKEN;
  if (!expected) return next(new HttpError(503, 'Integração com o FiltroAPP não configurada.'));
  const provided = /^Bearer (\S+)$/i.exec(request.get('authorization') || '')?.[1];
  if (!provided || !timingSafeEqual(
    createHash('sha256').update(provided).digest(),
    createHash('sha256').update(expected).digest()
  )) return next(new HttpError(401, 'Token de serviço inválido.'));
  next();
}

async function loadProposal(database, reference) {
  const { code, revision } = referenceSchema.parse(reference);
  const proposal = await database.proposal.findUnique({
    where: { proposalCode_revisionNumber: { proposalCode: code, revisionNumber: revision } }
  });
  if (!proposal) throw new HttpError(404, 'Proposta e revisão não encontradas.');
  if (proposal.status !== 'FINALIZADA') throw new HttpError(409, 'A revisão ainda não possui documentos finalizados.');
  return proposal;
}

async function pdfFile(document, readFile) {
  if (document.byteSize <= 0 || document.byteSize > MAX_PDF_BYTES) {
    throw new HttpError(409, 'O PDF da revisão ultrapassa o limite de tamanho.');
  }
  const bytes = await readFile(document.storagePath);
  if (!bytes.length || bytes.length > MAX_PDF_BYTES || bytes.length !== document.byteSize ||
      bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new HttpError(409, 'O PDF da revisão não está disponível ou está inválido.');
  }
  return bytes;
}

export async function exportFiltroProposal(database, reference, { readFile = loadFile } = {}) {
  const proposal = await loadProposal(database, reference);
  const documents = (await currentDocuments(database, proposal.id)).filter(item => item.format === 'PDF');
  if (documents.length !== 2 || new Set(documents.map(item => item.kind)).size !== 2 ||
      !documents.some(item => item.kind === 'COMERCIAL') || !documents.some(item => item.kind === 'TECNICA') ||
      documents.some(item => item.payloadHash !== payloadHash(proposal))) {
    throw new HttpError(409, 'Os PDFs atuais da revisão ainda não estão disponíveis.');
  }
  const metadata = describeDocuments(proposal, documents);
  const exportedDocuments = await Promise.all(documents.map(async (document, index) => {
    const bytes = await pdfFile(document, readFile);
    return {
      id: document.id, kind: document.kind, generationId: document.generationId,
      fileName: metadata[index].fileName, mimeType: 'application/pdf', byteSize: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex')
    };
  }));
  const estimate = await estimateForFinalizedProposal(database, proposal);
  return {
    contractVersion: 1, proposalId: proposal.id, proposalCode: proposal.proposalCode,
    revisionNumber: proposal.revisionNumber, clientCnpj: proposal.cnpj,
    projectId: proposal.crmProjectId || null,
    sourceUpdatedAt: new Date(Math.max(...documents.map(item => new Date(item.createdAt).getTime()))).toISOString(),
    scope: proposal.payload?.scopeItems ?? proposal.payload?.scope ?? [],
    costBreakdown: estimate?.payload ?? null, proposalSnapshot: proposal.payload,
    documents: exportedDocuments
  };
}

export async function exportFiltroDocument(database, reference, documentId, { readFile = loadFile } = {}) {
  const proposal = await loadProposal(database, reference);
  const document = await database.proposalDocument.findFirst({
    where: { id: documentId, proposalId: proposal.id, format: 'PDF' }
  });
  if (!document || document.payloadHash !== payloadHash(proposal)) {
    throw new HttpError(404, 'Documento não encontrado nesta revisão.');
  }
  return { bytes: await pdfFile(document, readFile), fileName: describeDocuments(proposal, [document])[0].fileName };
}

export function createFiltroExportRouter(database, dependencies = {}) {
  const router = Router();
  router.use(requireFiltroExportToken, (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/propostas/:code/revisoes/:revision', async (request, response) => {
    response.json(await exportFiltroProposal(database, request.params, dependencies));
  });
  router.get('/propostas/:code/revisoes/:revision/documentos/:documentId', async (request, response) => {
    const result = await exportFiltroDocument(database, request.params, request.params.documentId, dependencies);
    response.type('application/pdf').attachment(result.fileName).send(result.bytes);
  });
  return router;
}
