CREATE TABLE "CrmRelease" (
  "id" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "prismaProjectId" TEXT,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "CrmRelease_opportunityId_key" ON "CrmRelease"("opportunityId");
CREATE INDEX "CrmRelease_status_occurredAt_idx" ON "CrmRelease"("status", "occurredAt");

CREATE TABLE "CrmReleaseEvent" (
  "eventId" TEXT PRIMARY KEY,
  "releaseId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CrmReleaseEvent_releaseId_version_key" ON "CrmReleaseEvent"("releaseId", "version");

ALTER TABLE "Proposal"
  ADD COLUMN "crmReleaseId" TEXT,
  ADD COLUMN "crmClientId" TEXT,
  ADD COLUMN "prismaProjectId" TEXT,
  ADD COLUMN "crmStatusSequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "prismaDeliveryStatus" TEXT NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN "prismaReceivedId" TEXT,
  ADD COLUMN "prismaDeliveryError" TEXT,
  ADD COLUMN "prismaDeliveryAttemptId" TEXT,
  ADD COLUMN "prismaDeliveryAttemptAt" TIMESTAMP(3),
  ADD COLUMN "prismaDeliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "prismaDeliveryNextRetryAt" TIMESTAMP(3),
  ADD COLUMN "prismaDeliveryGenerationId" TEXT;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_crmReleaseId_fkey"
  FOREIGN KEY ("crmReleaseId") REFERENCES "CrmRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Proposal_prismaDeliveryStatus_prismaDeliveryNextRetryAt_idx"
  ON "Proposal"("prismaDeliveryStatus", "prismaDeliveryNextRetryAt");

ALTER TABLE "CrmProposalEvent"
  ADD COLUMN "statusSequence" INTEGER,
  ADD COLUMN "payloadHash" TEXT;
