-- Request Invoice attachments (Oct 2026) — purely additive, NO data backfill.
--
--  * "Document"."invoiceRequestId": a fourth optional parent (besides Project / PR Request / Customer). Existing rows get NULL
--    and behave exactly as before. ON DELETE CASCADE removes the metadata rows with their request; the application deletes the
--    physical files (see project.service.ts permanentlyDeleteProject).
--  * "InvoiceRequest"."emailStatus" / "emailDetail" / "emailUpdatedAt": the outcome of the notification email. NULL for requests
--    created before this migration (outcome was never recorded and none is invented).

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "invoiceRequestId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceRequest" ADD COLUMN "emailStatus" TEXT,
ADD COLUMN "emailDetail" TEXT,
ADD COLUMN "emailUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Document_invoiceRequestId_idx" ON "Document"("invoiceRequestId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_invoiceRequestId_fkey" FOREIGN KEY ("invoiceRequestId") REFERENCES "InvoiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
