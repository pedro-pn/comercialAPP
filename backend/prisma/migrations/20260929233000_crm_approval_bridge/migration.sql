ALTER TABLE "Proposal"
  ADD COLUMN "crmApprovalStatus" TEXT NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN "crmProjectId" TEXT,
  ADD COLUMN "crmApprovalSource" TEXT,
  ADD COLUMN "crmApprovalAt" TIMESTAMP(3),
  ADD COLUMN "filtroStatus" TEXT NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN "filtroError" TEXT,
  ADD COLUMN "filtroDeliveredAt" TIMESTAMP(3),
  ADD COLUMN "filtroAttemptId" TEXT,
  ADD COLUMN "filtroAttemptAt" TIMESTAMP(3);

CREATE TABLE "CrmProposalEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "approvalStatus" TEXT NOT NULL,
  "projectId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmProposalEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrmProposalEvent_eventId_key" ON "CrmProposalEvent"("eventId");
CREATE INDEX "CrmProposalEvent_proposalId_occurredAt_idx" ON "CrmProposalEvent"("proposalId", "occurredAt");
ALTER TABLE "CrmProposalEvent" ADD CONSTRAINT "CrmProposalEvent_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
