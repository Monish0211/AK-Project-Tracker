-- =============================================================================
-- PMO Portal — Manual invoice numbering: PRODUCTION schema migration
-- STATUS: FOR REVIEW ONLY. Do not run until production deployment is
-- separately approved.
--
-- Same end state as prisma/migrations/20261012120000_add_invoice_number_register
-- (production has no _prisma_migrations table, so `prisma migrate deploy`
-- must not be used). Run AFTER production_invoice_request_cc_migration.sql and
-- production_invoice_currency_migration.sql, in the same maintenance window,
-- with the backend stopped.
--
-- What it does: creates the InvoiceNumber register (one row per invoice
-- number in use; unique on upper(trim(number)) — the confirmed portal-wide,
-- case-insensitive rule) and registers every number already used by an
-- existing invoice line, under that line's project.
--
-- Safety:
-- - Additive: one new table + its indexes/FK. No existing row is modified;
--   historical invoice numbers are never renumbered or rewritten.
-- - Aborts (rolls back everything) if any number is already used by more
--   than one project — the uniqueness rule cannot be applied automatically
--   then; the listed numbers need a human decision first.
-- - Idempotent: IF NOT EXISTS / ON CONFLICT DO NOTHING; re-running only
--   registers numbers that are not registered yet.
-- - One transaction; the verification block aborts if any invoice number is
--   left unregistered or registered to the wrong project.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS "InvoiceNumber" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "invoiceNo" TEXT NOT NULL,
    "normalizedInvoiceNo" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceNumber_normalizedInvoiceNo_key" ON "InvoiceNumber"("normalizedInvoiceNo");
CREATE INDEX IF NOT EXISTS "InvoiceNumber_projectId_idx" ON "InvoiceNumber"("projectId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceNumber_projectId_fkey') THEN
    ALTER TABLE "InvoiceNumber" ADD CONSTRAINT "InvoiceNumber_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Pre-check: one number must never belong to two projects.
DO $$
DECLARE
  conflicts text;
BEGIN
  SELECT string_agg(k, ', ') INTO conflicts FROM (
    SELECT upper(btrim(l."invoiceNo", E' \t\r\n')) AS k
    FROM "InvoiceLine" l
    JOIN "QuantityItem" q ON q."id" = l."quantityItemId"
    GROUP BY 1
    HAVING COUNT(DISTINCT q."projectId") > 1
    ORDER BY 1
    LIMIT 50
  ) t;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Aborted: invoice numbers used by more than one project (resolve first): %', conflicts;
  END IF;
END $$;

INSERT INTO "InvoiceNumber" ("invoiceNo", "normalizedInvoiceNo", "projectId")
SELECT DISTINCT ON (upper(btrim(l."invoiceNo", E' \t\r\n')))
  btrim(l."invoiceNo", E' \t\r\n'),
  upper(btrim(l."invoiceNo", E' \t\r\n')),
  q."projectId"
FROM "InvoiceLine" l
JOIN "QuantityItem" q ON q."id" = l."quantityItemId"
ORDER BY upper(btrim(l."invoiceNo", E' \t\r\n')), l."createdAt"
ON CONFLICT ("normalizedInvoiceNo") DO NOTHING;

-- Verification — any failure aborts and rolls back the whole script.
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT COUNT(*) INTO bad
  FROM "InvoiceLine" l
  JOIN "QuantityItem" q ON q."id" = l."quantityItemId"
  LEFT JOIN "InvoiceNumber" n
    ON n."normalizedInvoiceNo" = upper(btrim(l."invoiceNo", E' \t\r\n')) AND n."projectId" = q."projectId"
  WHERE n."id" IS NULL;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'Aborted: % invoice line(s) whose number is not registered to their own project', bad;
  END IF;
END $$;

COMMIT;
