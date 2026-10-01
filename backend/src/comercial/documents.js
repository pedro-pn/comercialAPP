import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ATTACHMENT_LIMITS } from '../../../shared/schemas/comercial.js';
import { HttpError } from '../auth/service.js';
import { preencherProposta } from '../lib/comercial/proposta-docx.js';
import { planilhaDeCustos } from '../lib/comercial/cost-csv.js';
import { convertDocxToPdf } from '../lib/report-pdf-from-docx.js';
import { assertCanRead, assertCanWrite } from './access.js';
import { readPhoto } from './photos.js';
import { loadFile, removeFile, safeCode, storeFile } from './storage.js';

const kinds = [
  { kind: 'COMERCIAL', type: 'commercial', label: 'Comercial' },
  { kind: 'TECNICA', type: 'technical', label: 'Técnica' }
];

function proposalLabel(proposal) {
  return proposal.revisionNumber > 0
    ? `${proposal.proposalCode} Rev ${proposal.revisionNumber}` : proposal.proposalCode;
}

export function documentData(proposal) {
  return {
    ...(proposal.payload && typeof proposal.payload === 'object' ? proposal.payload : {}),
    proposalCode: proposal.proposalCode,
    revision: proposal.revisionNumber ? String(proposal.revisionNumber) : '',
    seller: proposal.sellerName,
    estimator: proposal.estimatorName,
    client: proposal.clientName,
    cnpj: proposal.cnpj,
    contact: proposal.contact,
    email: proposal.email,
    site: proposal.site,
    department: proposal.department || ''
  };
}

export function payloadHash(proposal) {
  return createHash('sha256').update(JSON.stringify(documentData(proposal))).digest('hex');
}

export function describeDocuments(proposal, items) {
  return items.map(item => ({
    id: item.id, kind: item.kind, format: item.format,
    fileName: `Proposta ${item.kind === 'COMERCIAL' ? 'Comercial' : 'Técnica'} - ${proposalLabel(proposal)}.${item.format.toLowerCase()}`,
    byteSize: item.byteSize, createdAt: item.createdAt
  }));
}

export async function currentDocuments(db, proposalId) {
  const newest = await db.proposalDocument.findFirst({
    where: { proposalId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  });
  if (!newest) return [];
  return db.proposalDocument.findMany({
    where: { proposalId, generationId: newest.generationId },
    orderBy: [{ kind: 'asc' }, { format: 'asc' }]
  });
}

export async function listDocuments(db, user, proposalId) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  if (user.role !== 'VIEWER') assertCanRead(user, proposal);
  const docs = await currentDocuments(db, proposalId);
  return { items: describeDocuments(proposal,
    user.role === 'VIEWER' ? docs.filter(item => item.kind === 'TECNICA') : docs) };
}

async function generatePair(data, type) {
  const docx = await preencherProposta(data, type);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'comercial-document-'));
  try {
    const docxPath = path.join(directory, 'proposta.docx');
    const pdfPath = path.join(directory, 'proposta.pdf');
    await writeFile(docxPath, docx);
    await convertDocxToPdf(docxPath, pdfPath);
    return { docx: await readFile(docxPath), pdf: await readFile(pdfPath) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function previewPdf(db, user, input) {
  const { tipo, ...payload } = input;
  if (tipo !== 'commercial' && tipo !== 'technical') throw new HttpError(400, 'Tipo de documento inválido.');
  const selectedSeller = payload.seller && ['ADMIN', 'MANAGER'].includes(user.role)
    ? await db.user.findFirst({ where: { id: payload.seller, isActive: true } })
    : null;
  const data = { ...payload, seller: selectedSeller?.name || user.name,
    lerFoto: block => readPhoto(db, user, block.id) };
  return (await generatePair(data, tipo)).pdf;
}

function validateIssue(proposal) {
  if (proposal.archivedAt || proposal.status !== 'RASCUNHO') {
    throw new HttpError(409, 'Somente rascunhos ativos podem emitir documentos.');
  }
  validateDocumentData(proposal);
}

function validateDocumentData(proposal) {
  const payload = proposal.payload || {};
  if (!String(payload.title || '').trim() || !Array.isArray(payload.scopeItems) ||
      !payload.scopeItems.length || !Array.isArray(payload.prices) ||
      !payload.prices.length || Number(proposal.totalValue) <= 0) {
    throw new HttpError(422, 'Preencha escopo e preços antes de emitir os documentos.');
  }
}

export async function issueDocuments(db, user, proposalId, generatePairFn = generatePair) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  assertCanWrite(user, proposal);
  validateIssue(proposal);
  const hash = payloadHash(proposal);
  const current = await currentDocuments(db, proposalId);
  if (current.length === 4 && current.every(item => item.payloadHash === hash)) {
    return { proposalId, proposalCode: proposal.proposalCode,
      documentos: describeDocuments(proposal, current) };
  }
  return storeGeneration(db, user, proposal, current, generatePairFn);
}

/** Recria os arquivos usando apenas os dados salvos, sem editar a proposta. */
export async function regenerateDocuments(db, user, proposalId, generatePairFn = generatePair) {
  if (user.role === 'VIEWER') throw new HttpError(403, 'O perfil de consulta não pode regerar documentos.');
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  assertCanWrite(user, proposal);
  if (proposal.archivedAt || proposal.status === 'FINALIZANDO') {
    throw new HttpError(409, 'A proposta está arquivada ou com finalização em andamento.');
  }
  validateDocumentData(proposal);
  const current = await currentDocuments(db, proposalId);
  if (current.length !== 4) {
    throw new HttpError(409, 'Emita os documentos da proposta antes de regerá-los.');
  }
  return storeGeneration(db, user, proposal, current, generatePairFn);
}

async function storeGeneration(db, user, proposal, current, generatePairFn) {
  const hash = payloadHash(proposal);
  const data = { ...documentData(proposal),
    lerFoto: block => readPhoto(db, user, block.id) };
  for (const block of Array.isArray(data.scopeBlocks) ? data.scopeBlocks : []) {
    if (block?.type === 'photo') await readPhoto(db, user, block.id);
  }
  const generationId = randomUUID();
  const directory = path.posix.join('propostas', safeCode(proposal.proposalCode), generationId);
  const stored = [];
  try {
    for (const { kind, type } of kinds) {
      const pair = await generatePairFn(data, type);
      for (const [format, bytes] of [['DOCX', pair.docx], ['PDF', pair.pdf]]) {
        const relative = path.posix.join(directory, `${type}.${format.toLowerCase()}`);
        const file = await storeFile(relative, bytes);
        stored.push({ generationId, payloadHash: hash, proposalId: proposal.id,
          kind, format, ...file });
      }
    }
    const items = await db.$transaction(async tx => {
      // Trava somente a publicação, depois da conversão. Uma geração ou edição
      // concorrente não pode publicar um conjunto baseado em dados antigos.
      await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${proposal.id} FOR UPDATE`;
      const latest = await tx.proposal.findUnique({ where: { id: proposal.id } });
      const latestDocuments = await currentDocuments(tx, proposal.id);
      if (!latest || latest.archivedAt || latest.status !== proposal.status
        || latest.updatedAt.getTime() !== proposal.updatedAt.getTime()
        || payloadHash(latest) !== hash
        || latestDocuments[0]?.generationId !== current[0]?.generationId) {
        throw new HttpError(409,
          'A proposta ou seus documentos mudaram durante a geração. Recarregue e tente novamente.');
      }
      return Promise.all(stored.map(data => tx.proposalDocument.create({ data })));
    });
    return { proposalId: proposal.id, proposalCode: proposal.proposalCode,
      documentos: describeDocuments(proposal, items) };
  } catch (error) {
    await Promise.all(stored.map(item => removeFile(item.storagePath).catch(() => {})));
    throw error;
  }
}

export async function finalizeLocal(db, user, proposalId) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  assertCanWrite(user, proposal);
  if (proposal.status === 'FINALIZADA') {
    return { status: 'FINALIZADA', documentos: describeDocuments(proposal,
      await currentDocuments(db, proposalId)) };
  }
  validateIssue(proposal);
  const docs = await currentDocuments(db, proposalId);
  if (docs.length !== 4 || docs.some(item => item.payloadHash !== payloadHash(proposal))) {
    throw new HttpError(409, 'Emita os documentos atualizados antes de finalizar.');
  }
  const attachments = await db.proposalAttachment.aggregate({
    where: { proposalId }, _sum: { byteSize: true }
  });
  const estimate = proposal.costEstimateId
    ? await db.costEstimate.findUnique({ where: { id: proposal.costEstimateId } }) : null;
  const spreadsheetBytes = estimate ? planilhaDeCustos(estimate, {
    proposalCode: proposal.proposalCode,
    sellerName: proposal.sellerName,
    estimatorName: proposal.estimatorName
  }).bytes.length : 0;
  const outgoingBytes = docs.filter(item => item.format === 'PDF')
    .reduce((sum, item) => sum + item.byteSize,
      (attachments._sum.byteSize || 0) + spreadsheetBytes);
  if (outgoingBytes > ATTACHMENT_LIMITS.maxAggregateBytes) {
    throw new HttpError(413,
      'Os PDFs, a planilha e os anexos ultrapassam 20 MB. Remova anexos antes de finalizar.');
  }
  const updated = await db.proposal.updateMany({
    where: { id: proposalId, status: 'RASCUNHO', updatedAt: proposal.updatedAt },
    data: { status: 'FINALIZADA', finalizedAt: new Date(), updatedByUserId: user.id,
      updatedByLabel: user.name }
  });
  if (updated.count !== 1) throw new HttpError(409, 'A proposta mudou durante a finalização. Recarregue.');
  return { status: 'FINALIZADA', documentos: describeDocuments(proposal, docs) };
}

export async function downloadDocument(db, user, id) {
  const item = await db.proposalDocument.findUnique({
    where: { id }, include: { proposal: true }
  });
  if (!item) throw new HttpError(404, 'Documento não encontrado.');
  if (user.role === 'VIEWER') {
    if (item.kind !== 'TECNICA') throw new HttpError(403, 'O perfil de consulta acessa apenas a proposta técnica.');
  } else {
    assertCanRead(user, item.proposal);
  }
  return { bytes: await loadFile(item.storagePath),
    fileName: describeDocuments(item.proposal, [item])[0].fileName,
    contentType: item.format === 'PDF' ? 'application/pdf' :
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
}
