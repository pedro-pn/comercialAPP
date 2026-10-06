CREATE TABLE "SalesConsultant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesConsultant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesConsultant_normalizedName_key" ON "SalesConsultant"("normalizedName");

ALTER TABLE "SalesConsultant" ADD CONSTRAINT "SalesConsultant_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Proposal" ALTER COLUMN "sellerUserId" DROP NOT NULL;
ALTER TABLE "Proposal" ADD COLUMN "sellerConsultantId" TEXT;
CREATE INDEX "Proposal_sellerConsultantId_idx" ON "Proposal"("sellerConsultantId");
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_sellerConsultantId_fkey"
    FOREIGN KEY ("sellerConsultantId") REFERENCES "SalesConsultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_seller_reference_check"
    CHECK (("sellerUserId" IS NOT NULL) <> ("sellerConsultantId" IS NOT NULL));
