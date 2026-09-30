import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { SCOPE_PHOTO_LIMITS, matchesImageSignature } from '../../../shared/schemas/comercial.js';
import { HttpError } from '../auth/service.js';
import { loadFile, removeFile, storeFile } from './storage.js';

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function uploadPhoto(db, user, { bytes, contentType, fileName }) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new HttpError(400, 'Selecione uma foto.');
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!SCOPE_PHOTO_LIMITS.allowedTypes.includes(mime) ||
    !matchesImageSignature(bytes, mime)) {
    throw new HttpError(415, 'Use uma imagem JPEG, PNG ou WebP válida.');
  }
  if (bytes.length > SCOPE_PHOTO_LIMITS.maxBytes) {
    throw new HttpError(413, 'A foto processada deve ter no máximo 1,5 MB.');
  }
  const id = randomUUID();
  const now = new Date();
  const relative = path.posix.join('escopo', String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'), `${id}.${extensions[mime]}`);
  const name = path.basename(String(fileName || 'foto')).replace(/[^\w. -]/g, '_').slice(0, 180);
  await storeFile(relative, bytes);
  try {
    return await db.scopePhotoAsset.create({ data: {
      id, assetKey: relative, contentType: mime, byteSize: bytes.length,
      fileName: name || 'foto', uploadedByUserId: user.id
    } });
  } catch (error) {
    await removeFile(relative);
    throw error;
  }
}

export async function readPhoto(db, user, id) {
  const photo = await db.scopePhotoAsset.findUnique({ where: { id } });
  if (!photo) throw new HttpError(404, 'Foto não encontrada.');
  if (!['ADMIN', 'MANAGER'].includes(user.role) && photo.uploadedByUserId !== user.id) {
    throw new HttpError(403, 'Foto de outro usuário.');
  }
  return {
    bytes: await loadFile(photo.assetKey),
    contentType: photo.contentType,
    mime: photo.contentType,
    extensao: extensions[photo.contentType],
    fileName: photo.fileName
  };
}
