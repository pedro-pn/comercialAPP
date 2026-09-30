import { z } from 'zod';

export const crmEventSchema = z.object({
  contractVersion: z.literal(1),
  eventId: z.string().uuid(),
  proposalCode: z.string().trim().min(1).max(40),
  revisionNumber: z.number().int().min(0),
  opportunityId: z.string().trim().min(1),
  approvalStatus: z.enum(['APPROVED', 'REJECTED']),
  projectId: z.string().trim().min(1).max(200).nullable().optional(),
  occurredAt: z.iso.datetime(),
  reason: z.string().trim().max(1000).optional()
});
