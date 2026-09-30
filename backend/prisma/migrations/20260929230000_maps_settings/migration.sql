CREATE TABLE "ComercialSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "sedeAddress" TEXT NOT NULL DEFAULT '',
  "sedeFormattedAddress" TEXT,
  "sedePlaceId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedByUserId" TEXT,
  "updatedByLabel" TEXT,
  CONSTRAINT "ComercialSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Proposal"
  ADD COLUMN "sharepointAttemptId" TEXT,
  ADD COLUMN "sharepointAttemptAt" TIMESTAMP(3),
  ADD COLUMN "sharepointError" TEXT;
