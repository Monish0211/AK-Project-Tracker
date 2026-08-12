-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "paymentType" TEXT NOT NULL DEFAULT 'Single';

-- CreateTable
CREATE TABLE "PaymentMilestone" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "milestoneName" TEXT NOT NULL,
    "paymentPercentage" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMilestone_projectId_idx" ON "PaymentMilestone"("projectId");

-- AddForeignKey
ALTER TABLE "PaymentMilestone" ADD CONSTRAINT "PaymentMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
