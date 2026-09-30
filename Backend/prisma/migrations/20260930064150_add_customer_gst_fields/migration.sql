-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "gstLegalName" TEXT,
ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "gstState" TEXT,
ADD COLUMN     "gstTradeName" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_customerId_key" ON "Document"("customerId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

