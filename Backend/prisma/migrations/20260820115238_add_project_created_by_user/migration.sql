-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Project_createdByUserId_idx" ON "Project"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
