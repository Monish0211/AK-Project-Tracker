-- Invoice-level GST snapshot (Nov 2026) - ADDITIVE ONLY.
--
-- One new table, one unique index, one foreign key and its integrity CHECKs. Nothing existing is altered, dropped,
-- backfilled or reseeded: no InvoiceLine / InvoiceNumber / Project / InvoicePayment column changes, no data rewrite,
-- no new ApprovalType. Every existing invoice therefore has NO row here, which the application treats as a LEGACY
-- invoice (GST unknown, settlement target unchanged = the taxable value). Rows are created only for invoices raised
-- after the application change ships; no automatic backfill exists or is part of this migration.
--
-- The invoice is identified by its InvoiceNumber register row (one row per invoice number). ON DELETE CASCADE removes
-- a snapshot together with its register row, which only happens when every line of the invoice is deleted.
-- Money is exact DECIMAL(18,3), like InvoicePayment. GST is INR-only today, so an APPLICABLE snapshot must be INR.
--
-- Rolling back is code-only: the table is read by nothing but the new code paths, so leaving it in place is harmless.
-- If the table ever has to be removed (only before any snapshot has been written): DROP TABLE "InvoiceGstSnapshot";
-- and delete this migration's row from "_prisma_migrations".

-- CreateTable
CREATE TABLE "InvoiceGstSnapshot" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "invoiceNumberId" TEXT NOT NULL,
    "gstStatus" TEXT NOT NULL,
    "ratePercent" DECIMAL(7,4),
    "taxType" TEXT,
    "buyerStateKnown" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL,
    "taxableAmount" DECIMAL(18,3) NOT NULL,
    "cgstAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InvoiceGstSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceGstSnapshot_invoiceNumberId_key" ON "InvoiceGstSnapshot"("invoiceNumberId");

-- AddForeignKey
ALTER TABLE "InvoiceGstSnapshot" ADD CONSTRAINT "InvoiceGstSnapshot_invoiceNumberId_fkey" FOREIGN KEY ("invoiceNumberId") REFERENCES "InvoiceNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules the application also enforces, repeated here so no other writer can break them.
ALTER TABLE "InvoiceGstSnapshot" ADD CONSTRAINT "InvoiceGstSnapshot_status_check" CHECK ("gstStatus" IN ('APPLICABLE', 'NOT_APPLICABLE'));
ALTER TABLE "InvoiceGstSnapshot" ADD CONSTRAINT "InvoiceGstSnapshot_taxType_check" CHECK ("taxType" IS NULL OR "taxType" IN ('IGST', 'CGST_SGST'));
-- APPLICABLE needs a rate (0..100, so "applicable at 0%" is explicit), a tax type and INR; NOT_APPLICABLE carries no rate, no type and no tax.
ALTER TABLE "InvoiceGstSnapshot" ADD CONSTRAINT "InvoiceGstSnapshot_state_check" CHECK (
  ("gstStatus" = 'APPLICABLE' AND "ratePercent" IS NOT NULL AND "ratePercent" >= 0 AND "ratePercent" <= 100 AND "taxType" IS NOT NULL AND "currency" = 'INR')
  OR
  ("gstStatus" = 'NOT_APPLICABLE' AND "ratePercent" IS NULL AND "taxType" IS NULL AND "gstAmount" = 0 AND "cgstAmount" = 0 AND "sgstAmount" = 0 AND "igstAmount" = 0)
);
ALTER TABLE "InvoiceGstSnapshot" ADD CONSTRAINT "InvoiceGstSnapshot_amounts_check" CHECK ("taxableAmount" >= 0 AND "cgstAmount" >= 0 AND "sgstAmount" >= 0 AND "igstAmount" >= 0 AND "gstAmount" >= 0 AND "totalAmount" >= 0);
-- The components add up to the GST amount, IGST and CGST+SGST never mix, and the total is exactly taxable + GST.
ALTER TABLE "InvoiceGstSnapshot" ADD CONSTRAINT "InvoiceGstSnapshot_components_check" CHECK (
  "gstAmount" = "cgstAmount" + "sgstAmount" + "igstAmount"
  AND ("taxType" IS DISTINCT FROM 'IGST' OR ("cgstAmount" = 0 AND "sgstAmount" = 0))
  AND ("taxType" IS DISTINCT FROM 'CGST_SGST' OR "igstAmount" = 0)
);
ALTER TABLE "InvoiceGstSnapshot" ADD CONSTRAINT "InvoiceGstSnapshot_total_check" CHECK ("totalAmount" = "taxableAmount" + "gstAmount");
