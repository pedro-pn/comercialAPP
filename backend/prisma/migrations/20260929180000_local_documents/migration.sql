CREATE TYPE "ProposalDocumentKind" AS ENUM ('COMERCIAL', 'TECNICA');
CREATE TYPE "ProposalDocumentFormat" AS ENUM ('PDF', 'DOCX');

CREATE TABLE "ProposalDocument" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "kind" "ProposalDocumentKind" NOT NULL,
    "format" "ProposalDocumentFormat" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProposalAttachment" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposalAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScopePhotoAsset" (
    "id" TEXT NOT NULL,
    "assetKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScopePhotoAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProposalDocument_generationId_kind_format_key" ON "ProposalDocument"("generationId", "kind", "format");
CREATE INDEX "ProposalDocument_proposalId_createdAt_idx" ON "ProposalDocument"("proposalId", "createdAt");
CREATE INDEX "ProposalAttachment_proposalId_createdAt_idx" ON "ProposalAttachment"("proposalId", "createdAt");
CREATE UNIQUE INDEX "ScopePhotoAsset_assetKey_key" ON "ScopePhotoAsset"("assetKey");
CREATE INDEX "ScopePhotoAsset_uploadedByUserId_createdAt_idx" ON "ScopePhotoAsset"("uploadedByUserId", "createdAt");

ALTER TABLE "ProposalDocument" ADD CONSTRAINT "ProposalDocument_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProposalAttachment" ADD CONSTRAINT "ProposalAttachment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
