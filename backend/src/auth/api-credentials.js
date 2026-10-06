import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './service.js';

export const CRM_EVENTS_SCOPE = 'crm.events.write';
export const CRM_RELEASES_SCOPE = 'crm.releases.write';
export const CRM_API_SCOPES = [CRM_EVENTS_SCOPE, CRM_RELEASES_SCOPE];
const TOKEN_PATTERN = /^cma_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{43})$/;
const DUMMY_HASH = Buffer.alloc(32);
const DAY_MS = 24 * 60 * 60 * 1000;

function tokenHash(token) {
  return createHash('sha256').update(token).digest();
}

function publicCredential(record) {
  return {
    id: record.id,
    name: record.name,
    tokenPrefix: `cma_${record.selector}`,
    tokenLastFour: record.tokenLastFour,
    scopeCode: record.scopeCode,
    createdByUserId: record.createdByUserId,
    createdByName: record.createdBy?.name || null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    revokedByUserId: record.revokedByUserId,
    revokedByName: record.revokedBy?.name || null,
    lastUsedAt: record.lastUsedAt,
    useCount: record.useCount
  };
}

export function credentialIsActive(record, now = new Date()) {
  return Boolean(record && !record.revokedAt && (!record.expiresAt || record.expiresAt > now));
}

export async function listApiCredentials(db) {
  const records = await db.apiCredential.findMany({
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { name: true } }, revokedBy: { select: { name: true } } }
  });
  return records.map(publicCredential);
}

export async function createApiCredential(db, actor, { name, expiresInDays, scopeCode = CRM_EVENTS_SCOPE }) {
  if (!CRM_API_SCOPES.includes(scopeCode)) throw new HttpError(400, 'Permissão de API inválida.');
  const selector = randomBytes(12).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const token = `cma_${selector}_${secret}`;
  const record = await db.apiCredential.create({ data: {
    name,
    selector,
    tokenHash: tokenHash(token).toString('hex'),
    tokenLastFour: secret.slice(-4),
    scopeCode,
    createdByUserId: actor.id,
    expiresAt: expiresInDays === null ? null : new Date(Date.now() + expiresInDays * DAY_MS)
  }, include: { createdBy: { select: { name: true } } } });
  return { credential: publicCredential(record), token };
}

export async function revokeApiCredential(db, actor, id) {
  const record = await db.apiCredential.findUnique({ where: { id } });
  if (!record) throw new HttpError(404, 'Token não encontrado.');
  if (record.revokedAt) return publicCredential(record);
  const revokedAt = new Date();
  await db.apiCredential.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt, revokedByUserId: actor.id }
  });
  return publicCredential(await db.apiCredential.findUnique({ where: { id },
    include: { createdBy: { select: { name: true } }, revokedBy: { select: { name: true } } } }));
}

export async function requireActiveApiCredential(db, id, scopeCode) {
  const record = await db.apiCredential.findUnique({ where: { id } });
  if (!record) throw new HttpError(404, 'Token não encontrado.');
  if (!credentialIsActive(record)) throw new HttpError(409, 'Token revogado ou expirado.');
  if (scopeCode && record.scopeCode !== scopeCode) {
    throw new HttpError(403, 'Token sem permissão para este contrato.');
  }
  return publicCredential(record);
}

export async function authenticateApiCredential(db, rawToken, scopeCode = CRM_EVENTS_SCOPE) {
  const parsed = typeof rawToken === 'string' ? TOKEN_PATTERN.exec(rawToken) : null;
  const record = parsed ? await db.apiCredential.findUnique({ where: { selector: parsed[1] } }) : null;
  const expected = record && /^[a-f0-9]{64}$/i.test(record.tokenHash)
    ? Buffer.from(record.tokenHash, 'hex') : DUMMY_HASH;
  const actual = tokenHash(parsed ? rawToken : 'invalid-token');
  const matches = timingSafeEqual(actual, expected);
  if (!matches || !credentialIsActive(record) || record.scopeCode !== scopeCode) {
    throw new HttpError(401, 'Token de API inválido, revogado ou expirado.');
  }
  const updated = await db.apiCredential.updateMany({
    where: { id: record.id, revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    data: { lastUsedAt: new Date(), useCount: { increment: 1 } }
  });
  if (updated.count !== 1) throw new HttpError(401, 'Token de API inválido, revogado ou expirado.');
  return publicCredential(record);
}

export function requireCrmApiCredential(db, scopeCode = CRM_EVENTS_SCOPE) {
  return async (request, _response, next) => {
    try {
      const match = /^Bearer (\S+)$/.exec(request.get('authorization') || '');
      request.apiCredential = await authenticateApiCredential(db, match?.[1], scopeCode);
      next();
    } catch (error) { next(error); }
  };
}
