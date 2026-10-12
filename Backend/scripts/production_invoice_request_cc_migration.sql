-- =============================================================================
-- PMO Portal — Invoice Request CC Members: PRODUCTION schema migration
-- STATUS: FOR REVIEW ONLY. Do not run until production deployment is
-- separately approved.
--
-- Same end state as
--   prisma/migrations/20261008062357_add_invoice_request_cc_members
-- made re-runnable (IF NOT EXISTS / guarded constraint creation), because
-- production has no _prisma_migrations table and `prisma migrate deploy`
-- must not be used there.
--
-- Why it is required: the invoice backend includes ccMembers on every
-- Invoice Request read and write (InvoiceRequestCcMember), so it cannot
-- serve Invoice Requests without this table.
--
-- Scope: Invoice Request CC only. It contains NO Project Notification System
-- objects (ProjectNotificationRecipient, NotificationEventLog, Project PM
-- recipient columns) — those belong to the separate, unfinished notification
-- release. The same CC statements also appear, guarded, in
-- production_notification_cc_migration.sql; both are idempotent, so running
-- either or both in any order leaves the same CC table.
--
-- Safety: purely additive — one new table, its indexes and two foreign keys.
-- No existing row is written. One transaction; the verification block aborts
-- (rolls back) if any object is missing.
--
-- Run order (same maintenance window, backend stopped):
--   1. production_invoice_request_cc_migration.sql   (this script)
--   2. production_invoice_currency_migration.sql
--   3. production_invoice_number_register_migration.sql
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS "InvoiceRequestCcMember" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "invoiceRequestId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRequestCcMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoiceRequestCcMember_invoiceRequestId_idx" ON "InvoiceRequestCcMember"("invoiceRequestId");
CREATE INDEX IF NOT EXISTS "InvoiceRequestCcMember_portalUserId_idx" ON "InvoiceRequestCcMember"("portalUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceRequestCcMember_invoiceRequestId_portalUserId_key" ON "InvoiceRequestCcMember"("invoiceRequestId", "portalUserId");

-- Foreign keys, created only if absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceRequestCcMember_invoiceRequestId_fkey') THEN
    ALTER TABLE "InvoiceRequestCcMember" ADD CONSTRAINT "InvoiceRequestCcMember_invoiceRequestId_fkey"
      FOREIGN KEY ("invoiceRequestId") REFERENCES "InvoiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceRequestCcMember_portalUserId_fkey') THEN
    ALTER TABLE "InvoiceRequestCcMember" ADD CONSTRAINT "InvoiceRequestCcMember_portalUserId_fkey"
      FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Verification — any failure aborts and rolls back the whole script.
DO $$
DECLARE
  missing integer;
BEGIN
  IF to_regclass('public."InvoiceRequestCcMember"') IS NULL THEN
    RAISE EXCEPTION 'Aborted: InvoiceRequestCcMember table is missing';
  END IF;

  SELECT 3 - COUNT(*) INTO missing FROM pg_indexes
  WHERE schemaname = 'public' AND indexname IN (
    'InvoiceRequestCcMember_invoiceRequestId_idx',
    'InvoiceRequestCcMember_portalUserId_idx',
    'InvoiceRequestCcMember_invoiceRequestId_portalUserId_key');
  IF missing <> 0 THEN RAISE EXCEPTION 'Aborted: % index(es) missing', missing; END IF;

  SELECT 2 - COUNT(*) INTO missing FROM pg_constraint WHERE conname IN (
    'InvoiceRequestCcMember_invoiceRequestId_fkey', 'InvoiceRequestCcMember_portalUserId_fkey');
  IF missing <> 0 THEN RAISE EXCEPTION 'Aborted: % foreign key(s) missing', missing; END IF;
END $$;

COMMIT;
