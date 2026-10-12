-- CreateTable
CREATE TABLE "InvoiceRequestCcMember" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "invoiceRequestId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRequestCcMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceRequestCcMember_invoiceRequestId_idx" ON "InvoiceRequestCcMember"("invoiceRequestId");

-- CreateIndex
CREATE INDEX "InvoiceRequestCcMember_portalUserId_idx" ON "InvoiceRequestCcMember"("portalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRequestCcMember_invoiceRequestId_portalUserId_key" ON "InvoiceRequestCcMember"("invoiceRequestId", "portalUserId");

-- AddForeignKey
ALTER TABLE "InvoiceRequestCcMember" ADD CONSTRAINT "InvoiceRequestCcMember_invoiceRequestId_fkey" FOREIGN KEY ("invoiceRequestId") REFERENCES "InvoiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRequestCcMember" ADD CONSTRAINT "InvoiceRequestCcMember_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
