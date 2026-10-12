-- =============================================================================
-- PMO Portal — ROLLBACK of production_invoice_number_register_migration.sql
-- STATUS: FOR REVIEW ONLY. Normally NOT needed: the previous application
-- build ignores this table, so an application-only rollback is safe.
--
-- The register holds no information of its own — every row is derivable
-- from InvoiceLine.invoiceNo (re-running the migration rebuilds it exactly),
-- so dropping it loses nothing. It must only be dropped AFTER the
-- application has been rolled back to a build that does not use it (the
-- current build cannot save invoices without it). Invoice lines and their
-- numbers are never touched.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "InvoiceNumber";
COMMIT;
