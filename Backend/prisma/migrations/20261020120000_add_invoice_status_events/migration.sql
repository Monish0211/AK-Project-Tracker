-- Invoice Tracker (Oct 2026) — append-only invoice status history.
--
-- Purely additive: one new table, no change to any existing table, NO data
-- backfill (invoices that predate this table have no recorded history, and
-- none is invented). Rows are written by the application in the same
-- transaction as each invoice-line create / status change / delete / ingest.
--
-- No foreign key to "InvoiceLine" or "Project" on purpose: deleting an invoice
-- (or permanently deleting a project) must not cascade-delete its audit trail.
-- The actor FK is ON DELETE SET NULL; "actorName" keeps a snapshot.

-- CreateTable
CREATE TABLE "InvoiceStatusEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "seq" BIGSERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "prNo" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "InvoiceStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceStatusEvent_invoiceLineId_occurredAt_idx" ON "InvoiceStatusEvent"("invoiceLineId", "occurredAt");

-- CreateIndex
CREATE INDEX "InvoiceStatusEvent_projectId_occurredAt_idx" ON "InvoiceStatusEvent"("projectId", "occurredAt");

-- AddForeignKey
ALTER TABLE "InvoiceStatusEvent" ADD CONSTRAINT "InvoiceStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
