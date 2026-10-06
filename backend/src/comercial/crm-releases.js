import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../auth/service.js';

export const crmReleaseSchema = z.object({
  contractVersion: z.literal(2),
  eventId: z.string().uuid(),
  releaseId: z.string().uuid(),
  releaseVersion: z.number().int().min(1).max(2147483647),
  releaseStatus: z.enum(['ACTIVE', 'REVOKED']),
  clientId: z.string().trim().min(1).max(500),
  opportunityId: z.string().trim().min(1).max(500),
  prismaProjectId: z.string().trim().min(1).max(500).nullable(),
  contactId: z.string().trim().min(1).max(500),
  legalName: z.string().trim().min(1).max(4000),
  taxId: z.string().regex(/^\d{14}$/),
  contactName: z.string().trim().min(1).max(4000),
  email: z.email(),
  department: z.string().max(4000),
  site: z.string().trim().min(1).max(4000),
  description: z.string().trim().min(1).max(4000),
  occurredAt: z.iso.datetime()
}).strict();

// Os contratos contêm somente campos escalares; a ordem das chaves não muda o hash.
export function canonicalHash(value) {
  const sorted = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

export async function recordCrmRelease(db, input) {
  const event = crmReleaseSchema.parse(input);
  const hash = canonicalHash(event);
  const result = duplicate => ({
    duplicate, releaseId: event.releaseId,
    releaseVersion: event.releaseVersion, status: event.releaseStatus
  });
  try {
    return await db.$transaction(async tx => {
      const old = await tx.crmReleaseEvent.findUnique({ where: { eventId: event.eventId } });
      if (old) {
        if (old.payloadHash !== hash) throw new HttpError(409, 'Evento reutilizado com conteúdo diferente.');
        return result(true);
      }
      const current = await tx.crmRelease.findUnique({ where: { id: event.releaseId } });
      if (current && (current.clientId !== event.clientId || current.opportunityId !== event.opportunityId)) {
        throw new HttpError(409, 'Identidade da liberação divergente.');
      }
      if (current && (event.releaseVersion <= current.version || new Date(event.occurredAt) < current.occurredAt)) {
        throw new HttpError(409, 'Evento de liberação anterior ao estado atual.');
      }
      await tx.crmReleaseEvent.create({ data: {
        eventId: event.eventId, releaseId: event.releaseId,
        version: event.releaseVersion, payloadHash: hash
      } });
      const data = {
        clientId: event.clientId, opportunityId: event.opportunityId,
        prismaProjectId: event.prismaProjectId, version: event.releaseVersion,
        status: event.releaseStatus, snapshot: event, occurredAt: new Date(event.occurredAt)
      };
      if (current) {
        const changed = await tx.crmRelease.updateMany({ where: { id: event.releaseId, version: current.version }, data });
        if (changed.count !== 1) throw new HttpError(409, 'Liberação atualizada em paralelo.');
      } else {
        await tx.crmRelease.create({ data: { id: event.releaseId, ...data } });
      }
      return result(false);
    });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const old = await db.crmReleaseEvent.findUnique({ where: { eventId: event.eventId } });
    if (old?.payloadHash === hash) return result(true);
    throw new HttpError(409, 'Identidade ou versão da liberação conflitante.');
  }
}

export async function releaseForProposal(db, id) {
  const release = await db.crmRelease.findUnique({ where: { id } });
  if (!release || release.status !== 'ACTIVE') throw new HttpError(409, 'Liberação Prisma inexistente ou revogada.');
  return release;
}
