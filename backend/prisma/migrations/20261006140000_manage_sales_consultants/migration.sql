ALTER TABLE "SalesConsultant" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "SalesConsultant" ALTER COLUMN "normalizedName" DROP NOT NULL;
