import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ATTACHMENT_LIMITS } from '../../../shared/schemas/comercial.js';
import { HttpError } from '../auth/service.js';
import { assertCanRead, assertCanWrite } from './access.js';
import { loadFile, removeFile, safeCode, storeFile } from './storage.js';

const blockedExtensions = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.ps1', '.sh', '.js', '.jse',
  '.vbs', '.vbe', '.jar', '.app', '.dll', '.lnk', '.hta'
]);

function cleanName(value) {
  return String(value || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '')
    .trim().slice(0, 180) || 'anexo';
}

async function proposalForAttachments(db, user, proposalId, write = false) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada.');
  (write ? assertCanWrite : assertCanRead)(user, proposal);
  return proposal;
}

export async function listAttachments(db, user, proposalId) {
  await proposalForAttachments(db, user, proposalId);
  const items = await db.proposalAttachment.findMany({
    where: { proposalId }, orderBy: { createdAt: 'asc' }
  });
  const bytesUsed = items.reduce((sum, item) => sum + item.byteSize, 0);
  return { items: items.map(({ id, originalName, byteSize, createdAt }) =>
    ({ id, originalName, byteSize, createdAt })),
    total: items.length, bytesUsados: bytesUsed,
    bytesDisponiveis: Math.max(0, ATTACHMENT_LIMITS.maxAggregateBytes - bytesUsed) };
}

export async function addAttachment(db, user, proposalId, { bytes, fileName }) {
  const proposal = await proposalForAttachments(db, user, proposalId, true);
  if (proposal.archivedAt || proposal.status !== 'RASCUNHO') {
    throw new HttpError(409, 'Anexos só podem ser alterados no rascunho.');
  }
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new HttpError(400, 'Selecione um arquivo.');
  const originalName = cleanName(fileName);
  const extension = path.extname(originalName).toLowerCase();
  if (blockedExtensions.has(extension)) throw new HttpError(415, 'Este tipo de arquivo não é aceito.');
  const used = await db.proposalAttachment.aggregate({
    where: { proposalId }, _sum: { byteSize: true }
  });
  if ((used._sum.byteSize || 0) + bytes.length > ATTACHMENT_LIMITS.maxAggregateBytes) {
    throw new HttpError(413, 'Os anexos desta proposta excedem o limite de 20 MB.');
  }
  const relative = path.posix.join('propostas', safeCode(proposal.proposalCode),
    'anexos', `${randomUUID()}${extension}`);
  await storeFile(relative, bytes);
  try {
    const item = await db.proposalAttachment.create({ data: {
      proposalId, storagePath: relative, originalName, byteSize: bytes.length,
      createdByUserId: user.id
    } });
    return { id: item.id, originalName, byteSize: item.byteSize, createdAt: item.createdAt };
  } catch (error) {
    await removeFile(relative);
    throw error;
  }
}

export async function removeAttachment(db, user, proposalId, id) {
  const proposal = await proposalForAttachments(db, user, proposalId, true);
  if (proposal.status !== 'RASCUNHO') throw new HttpError(409, 'A proposta já foi finalizada.');
  const item = await db.proposalAttachment.findFirst({ where: { id, proposalId } });
  if (!item) throw new HttpError(404, 'Anexo não encontrado.');
  await db.proposalAttachment.delete({ where: { id } });
  await removeFile(item.storagePath);
  return { id, originalName: item.originalName };
}

export async function downloadAttachment(db, user, id) {
  const item = await db.proposalAttachment.findUnique({ where: { id }, include: { proposal: true } });
  if (!item) throw new HttpError(404, 'Anexo não encontrado.');
  assertCanRead(user, item.proposal);
  return { bytes: await loadFile(item.storagePath), fileName: item.originalName };
}
