-- CreateEnum
CREATE TYPE "CostEstimateMode" AS ENUM ('NOVA', 'REVISAO');

-- CreateEnum
CREATE TYPE "CostEstimateStatus" AS ENUM ('RASCUNHO', 'SALVO');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('RASCUNHO', 'FINALIZANDO', 'FINALIZADA', 'FALHA_INTEGRACAO');

-- CreateEnum
CREATE TYPE "ProposalIntegrationStatus" AS ENUM ('PENDENTE', 'SUCESSO', 'ERRO');

-- CreateTable
CREATE TABLE "ProposalNumberingState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "seedValue" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL,
    "seededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seededByUserId" TEXT NOT NULL,

    CONSTRAINT "ProposalNumberingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalNumberReservation" (
    "number" INTEGER NOT NULL,
    "reservedByUserId" TEXT NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstUsedAt" TIMESTAMP(3),

    CONSTRAINT "ProposalNumberReservation_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "CostEstimate" (
    "id" TEXT NOT NULL,
    "proposalCode" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "mode" "CostEstimateMode" NOT NULL,
    "status" "CostEstimateStatus" NOT NULL DEFAULT 'RASCUNHO',
    "payload" JSONB NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "salePrice" DECIMAL(14,2) NOT NULL,
    "marginPercent" DECIMAL(6,2) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByLabel" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEstimateVersion" (
    "id" TEXT NOT NULL,
    "costEstimateId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEstimateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "proposalCode" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 0,
    "costEstimateId" TEXT,
    "clientName" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "department" TEXT,
    "sellerUserId" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "estimatorName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "totalValue" DECIMAL(14,2) NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'RASCUNHO',
    "finalizedAt" TIMESTAMP(3),
    "nectarStatus" "ProposalIntegrationStatus" NOT NULL DEFAULT 'PENDENTE',
    "nectarOpportunityId" TEXT,
    "nectarPipelineId" TEXT,
    "nectarPipelineName" TEXT,
    "sharepointStatus" "ProposalIntegrationStatus" NOT NULL DEFAULT 'PENDENTE',
    "sharepointFolder" TEXT,
    "integrationError" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByLabel" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalNumberReservation_reservedByUserId_reservedAt_idx" ON "ProposalNumberReservation"("reservedByUserId", "reservedAt");

-- CreateIndex
CREATE INDEX "CostEstimate_createdByUserId_archivedAt_createdAt_idx" ON "CostEstimate"("createdByUserId", "archivedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CostEstimate_proposalCode_revisionNumber_key" ON "CostEstimate"("proposalCode", "revisionNumber");

-- CreateIndex
CREATE INDEX "CostEstimateVersion_costEstimateId_createdAt_idx" ON "CostEstimateVersion"("costEstimateId", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_createdByUserId_archivedAt_createdAt_idx" ON "Proposal"("createdByUserId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_sellerUserId_createdAt_idx" ON "Proposal"("sellerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_proposalCode_revisionNumber_key" ON "Proposal"("proposalCode", "revisionNumber");

-- AddForeignKey
ALTER TABLE "ProposalNumberReservation" ADD CONSTRAINT "ProposalNumberReservation_reservedByUserId_fkey" FOREIGN KEY ("reservedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimateVersion" ADD CONSTRAINT "CostEstimateVersion_costEstimateId_fkey" FOREIGN KEY ("costEstimateId") REFERENCES "CostEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_costEstimateId_fkey" FOREIGN KEY ("costEstimateId") REFERENCES "CostEstimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
