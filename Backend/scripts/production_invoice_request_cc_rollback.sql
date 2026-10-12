-- =============================================================================
-- PMO Portal — ROLLBACK of production_invoice_request_cc_migration.sql
-- STATUS: FOR REVIEW ONLY. Normally NOT needed: the previous application
-- build ignores this table, so an application-only rollback is safe.
--
-- Refuses to run once any CC member has been recorded, because dropping the
-- table would destroy that data. Must only run AFTER the application has
-- been rolled back to a build that does not use InvoiceRequestCcMember (the
-- invoice build cannot serve Invoice Requests without it). Touches no
-- notification object and no other table.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  n bigint := 0;
BEGIN
  IF to_regclass('public."InvoiceRequestCcMember"') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM "InvoiceRequestCcMember"' INTO n;
  END IF;
  IF n > 0 THEN
    RAISE EXCEPTION 'Rollback refused: % Invoice Request CC member row(s) exist and would be destroyed.', n;
  END IF;
END $$;

DROP TABLE IF EXISTS "InvoiceRequestCcMember";

COMMIT;
