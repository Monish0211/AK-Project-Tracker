-- =============================================================================
-- PMO Portal — Invoice Currency feature: PRODUCTION schema migration
-- STATUS: FOR REVIEW ONLY. Do not run until production deployment is
-- separately approved.
--
-- Why a hand-written script instead of `prisma migrate deploy`:
-- the production database has NO _prisma_migrations table (audited
-- 2026-10-12), so `migrate deploy` would try to replay every migration from
-- the first one against tables that already exist. This script applies ONLY
-- the Invoice Currency change, with exactly the same effect as
-- prisma/migrations/20261009122039_add_invoice_currency_fields/migration.sql.
--
-- Safety properties:
-- - Additive only: three new InvoiceLine columns and one new Project column.
--   No existing column, row value, constraint or index is changed or dropped.
-- - The only data write sets invoiceAmountOriginal = invoiceAmountINR on INR
--   rows where they differ. invoiceAmountINR itself is never touched.
-- - Idempotent: IF NOT EXISTS everywhere; re-running is safe and also
--   repairs any INR row an old backend wrote after the first run.
-- - Must be preceded by production_invoice_request_cc_migration.sql in the
--   same maintenance window, and followed by
--   production_invoice_number_register_migration.sql: the invoice backend
--   needs the schema from all three (verified locally).
-- - All-or-nothing: one transaction, and the verification block at the end
--   raises an exception (rolling everything back) if row counts, the INR
--   total, or any historical amount changed.
-- - Fast: on PostgreSQL 11+ (production runs 18.6), ADD COLUMN with a
--   constant DEFAULT is a metadata-only change, not a table rewrite.
--   lock_timeout stops it from queueing behind a long transaction.
-- - Compatible with the CURRENT application: the old backend never selects
--   or inserts these columns, and the NOT NULL columns have defaults, so it
--   keeps working unchanged once this has run. That is why this script must
--   run BEFORE the new backend is deployed (the new backend reads them).
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Snapshot of every invoice amount before anything changes.
CREATE TEMP TABLE _invoice_currency_before ON COMMIT DROP AS
SELECT "id", "invoiceAmountINR", "status" FROM "InvoiceLine";

ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "exchangeRateToINR" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "invoiceAmountOriginal" DOUBLE PRECISION;

-- Every INR line's original amount IS its INR amount (the invariant the new
-- backend maintains). This one statement covers:
--   * first run: every pre-existing line (original was just added as NULL);
--   * a re-run after any old-backend write: a line CREATED by the old
--     backend (original left NULL) and a line whose amount the old backend
--     PATCHED (invoiceAmountINR changed, original left stale).
-- Verified on a disposable database: the earlier "IS NULL only" version
-- aborted on a re-run after an old-backend amount edit.
-- invoiceAmountINR itself is never written. Non-INR lines are never touched.
UPDATE "InvoiceLine"
SET "invoiceAmountOriginal" = "invoiceAmountINR"
WHERE "currency" = 'INR' AND "invoiceAmountOriginal" IS DISTINCT FROM "invoiceAmountINR";

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "invoiceCurrency" TEXT;

-- Verification — any failure aborts and rolls back the whole script.
DO $$
DECLARE
  changed_rows integer;
  missing_rows integer;
  bad_inr_rows integer;
  wrong_types integer;
BEGIN
  -- IF NOT EXISTS would silently skip a pre-existing column of the wrong
  -- shape; make sure all four are exactly what the application expects.
  SELECT COUNT(*) INTO wrong_types FROM (VALUES
      ('InvoiceLine', 'currency', 'text', 'NO'),
      ('InvoiceLine', 'exchangeRateToINR', 'double precision', 'NO'),
      ('InvoiceLine', 'invoiceAmountOriginal', 'double precision', 'YES'),
      ('Project', 'invoiceCurrency', 'text', 'YES')
    ) AS expected(tbl, col, typ, nullable)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = expected.tbl AND c.column_name = expected.col
      AND c.data_type = expected.typ AND c.is_nullable = expected.nullable
  );
  IF wrong_types <> 0 THEN
    RAISE EXCEPTION 'Invoice currency migration aborted: % column(s) missing or of an unexpected type', wrong_types;
  END IF;

  SELECT COUNT(*) INTO missing_rows
  FROM _invoice_currency_before b
  LEFT JOIN "InvoiceLine" l ON l."id" = b."id"
  WHERE l."id" IS NULL;

  SELECT COUNT(*) INTO changed_rows
  FROM _invoice_currency_before b
  JOIN "InvoiceLine" l ON l."id" = b."id"
  WHERE l."invoiceAmountINR" IS DISTINCT FROM b."invoiceAmountINR"
     OR l."status" IS DISTINCT FROM b."status";

  SELECT COUNT(*) INTO bad_inr_rows
  FROM "InvoiceLine"
  WHERE "currency" = 'INR'
    AND ("exchangeRateToINR" <> 1 OR "invoiceAmountOriginal" IS DISTINCT FROM "invoiceAmountINR");

  IF missing_rows <> 0 THEN
    RAISE EXCEPTION 'Invoice currency migration aborted: % invoice line(s) missing after migration', missing_rows;
  END IF;
  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Invoice currency migration aborted: % invoice line amount/status value(s) changed', changed_rows;
  END IF;
  IF bad_inr_rows <> 0 THEN
    RAISE EXCEPTION 'Invoice currency migration aborted: % INR line(s) without rate 1 / original = INR amount', bad_inr_rows;
  END IF;
END $$;

COMMIT;

-- Post-run check (read-only), for the deployment log:
-- SELECT "currency", COUNT(*), SUM("invoiceAmountINR") FROM "InvoiceLine" GROUP BY "currency";
-- SELECT COUNT(*) FROM "Project" WHERE "invoiceCurrency" IS NOT NULL;   -- expect 0 right after migration
