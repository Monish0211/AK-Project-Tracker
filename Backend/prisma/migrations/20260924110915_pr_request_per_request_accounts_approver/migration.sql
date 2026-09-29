/*
  Warnings:

  - You are about to drop the `PRRequestApproverConfig` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PRRequestApproverConfig" DROP CONSTRAINT "PRRequestApproverConfig_accountsApproverId_fkey";

-- AlterTable
ALTER TABLE "PRRequest" ADD COLUMN     "assignedAccountsApproverId" TEXT;

-- DropTable
DROP TABLE "PRRequestApproverConfig";

-- CreateIndex
CREATE INDEX "PRRequest_assignedAccountsApproverId_idx" ON "PRRequest"("assignedAccountsApproverId");

-- AddForeignKey
ALTER TABLE "PRRequest" ADD CONSTRAINT "PRRequest_assignedAccountsApproverId_fkey" FOREIGN KEY ("assignedAccountsApproverId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
