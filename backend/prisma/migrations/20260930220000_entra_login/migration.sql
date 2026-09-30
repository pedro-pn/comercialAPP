ALTER TABLE "User" ADD COLUMN "microsoftTenantId" TEXT;
ALTER TABLE "User" ADD COLUMN "microsoftObjectId" TEXT;
CREATE UNIQUE INDEX "User_microsoftTenantId_microsoftObjectId_key"
  ON "User"("microsoftTenantId", "microsoftObjectId");
