-- CreateTable
CREATE TABLE "QuantityItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "woQty" DOUBLE PRECISION NOT NULL,
    "invoiceQty" DOUBLE PRECISION NOT NULL,
    "pendingQty" DOUBLE PRECISION NOT NULL,
    "unitRate" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "unitRateINR" DOUBLE PRECISION NOT NULL,
    "woValue" DOUBLE PRECISION NOT NULL,
    "pendingAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuantityItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuantityItem_projectId_idx" ON "QuantityItem"("projectId");

-- AddForeignKey
ALTER TABLE "QuantityItem" ADD CONSTRAINT "QuantityItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
