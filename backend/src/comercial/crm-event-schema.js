import { z } from 'zod';

const common = {
  eventId: z.string().uuid(),
  proposalCode: z.string().trim().min(1).max(40),
  revisionNumber: z.number().int().min(0),
  opportunityId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).max(200).nullable().optional(),
  occurredAt: z.iso.datetime(),
  reason: z.string().trim().max(1000).optional()
};

export const crmEventSchema = z.discriminatedUnion('contractVersion', [
  z.object({
    ...common,
    contractVersion: z.literal(1),
    approvalStatus: z.enum(['APPROVED', 'REJECTED'])
  }),
  z.object({
    ...common,
    contractVersion: z.literal(2),
    revisionNumber: z.number().int().min(0).max(999999999),
    opportunityId: z.string().trim().min(1).max(500),
    approvalStatus: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
    statusSequence: z.number().int().min(1).max(2147483647),
    releaseId: z.string().uuid().optional(),
    clientId: z.string().trim().min(1).max(500).optional(),
    prismaProjectId: z.string().trim().min(1).max(500).nullable().optional(),
    proposalId: z.string().trim().min(1).max(200).optional()
  }).strict()
]);
