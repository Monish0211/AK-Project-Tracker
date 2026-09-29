-- AlterTable
ALTER TABLE "ProjectExpense" ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ExpenseImportBatch" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "fileHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "totalSheetsFound" INTEGER NOT NULL DEFAULT 0,
    "totalRowsFound" INTEGER NOT NULL DEFAULT 0,
    "totalRowsImported" INTEGER NOT NULL DEFAULT 0,
    "totalRowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseImportBatch_fileHash_key" ON "ExpenseImportBatch"("fileHash");

-- CreateIndex
CREATE INDEX "ExpenseImportBatch_uploadedByUserId_idx" ON "ExpenseImportBatch"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "ProjectExpense_importBatchId_idx" ON "ProjectExpense"("importBatchId");

-- CreateIndex
CREATE INDEX "ProjectExpense_projectId_isActive_idx" ON "ProjectExpense"("projectId", "isActive");

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ExpenseImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseImportBatch" ADD CONSTRAINT "ExpenseImportBatch_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
