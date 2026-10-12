-- =============================================================================
-- PMO Portal — Invoice Currency feature: schema ROLLBACK
-- STATUS: FOR REVIEW ONLY. Normally NOT needed.
--
-- The preferred rollback is to redeploy the previous application build and
-- LEAVE these columns in place: the old backend/frontend ignore them (the
-- NOT NULL columns have defaults), so an app-only rollback is safe and loses
-- nothing.
--
-- Use this script only if the columns themselves must be removed. It
-- refuses to run once any non-INR invoice or any project currency lock
-- exists, because dropping the columns would then permanently destroy the
-- record of what currency/rate/original amount those invoices were billed
-- in (their invoiceAmountINR is kept either way).
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  foreign_lines integer := 0;
  locked_projects integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'InvoiceLine' AND column_name = 'currency') THEN
    EXECUTE 'SELECT COUNT(*) FROM "InvoiceLine" WHERE "currency" <> ''INR''' INTO foreign_lines;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Project' AND column_name = 'invoiceCurrency') THEN
    EXECUTE 'SELECT COUNT(*) FROM "Project" WHERE "invoiceCurrency" IS NOT NULL AND "invoiceCurrency" <> ''INR''' INTO locked_projects;
  END IF;
  IF foreign_lines > 0 OR locked_projects > 0 THEN
    RAISE EXCEPTION 'Rollback refused: % non-INR invoice line(s) and % non-INR project lock(s) exist. Dropping the columns would destroy that data.', foreign_lines, locked_projects;
  END IF;
END $$;

ALTER TABLE "InvoiceLine" DROP COLUMN IF EXISTS "invoiceAmountOriginal";
ALTER TABLE "InvoiceLine" DROP COLUMN IF EXISTS "exchangeRateToINR";
ALTER TABLE "InvoiceLine" DROP COLUMN IF EXISTS "currency";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "invoiceCurrency";

COMMIT;
