ALTER TYPE "CommercialRole" ADD VALUE 'ADMIN';
ALTER TABLE "Proposal" ADD COLUMN "crmOpportunityId" TEXT;
ALTER TABLE "CrmProposalEvent" ADD COLUMN "opportunityId" TEXT;

CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenLastFour" TEXT NOT NULL,
    "scopeCode" TEXT NOT NULL DEFAULT 'crm.events.write',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiCredential_selector_key" ON "ApiCredential"("selector");
CREATE INDEX "ApiCredential_createdAt_idx" ON "ApiCredential"("createdAt");
CREATE INDEX "ApiCredential_expiresAt_revokedAt_idx" ON "ApiCredential"("expiresAt", "revokedAt");
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
