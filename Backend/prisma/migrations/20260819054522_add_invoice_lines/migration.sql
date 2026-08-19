-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "quantityItemId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "milestoneId" TEXT,
    "milestoneName" TEXT,
    "setIndex" INTEGER,
    "description" TEXT,
    "quantityBilled" DOUBLE PRECISION NOT NULL,
    "unitPriceINR" DOUBLE PRECISION,
    "calculatedAmountINR" DOUBLE PRECISION,
    "invoiceAmountINR" DOUBLE PRECISION NOT NULL,
    "commercialAdjustmentINR" DOUBLE PRECISION,
    "clientReference" TEXT,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLine_quantityItemId_idx" ON "InvoiceLine"("quantityItemId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceNo_idx" ON "InvoiceLine"("invoiceNo");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_quantityItemId_fkey" FOREIGN KEY ("quantityItemId") REFERENCES "QuantityItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
