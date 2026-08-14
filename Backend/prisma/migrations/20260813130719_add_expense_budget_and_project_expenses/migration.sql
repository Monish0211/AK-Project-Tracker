-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "manhourBudgetAmount" DOUBLE PRECISION,
ADD COLUMN     "manhourBudgetHours" DOUBLE PRECISION,
ADD COLUMN     "manhourBudgetRemarks" TEXT,
ADD COLUMN     "nonManhourBudgetAmount" DOUBLE PRECISION,
ADD COLUMN     "nonManhourBudgetRemarks" TEXT;

-- CreateTable
CREATE TABLE "ProjectExpense" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectExpense_projectId_idx" ON "ProjectExpense"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
