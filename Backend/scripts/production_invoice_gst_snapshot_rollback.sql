-- =============================================================================
-- PMO Portal - ROLLBACK of migration 20261105120000_add_invoice_gst_snapshot
-- STATUS: FOR REVIEW ONLY. Normally NOT needed: the previous application build ignores this table, so an
-- application-only rollback is safe and leaves the table (and any snapshots) in place.
--
-- UNLIKE the invoice-number register, a snapshot row holds information that cannot be re-derived (the GST that applied
-- when the invoice was raised). This script therefore REFUSES to drop the table once any snapshot exists. Run it only
-- before the first snapshot has been written, after the application has been rolled back to a build that does not
-- read it. It never touches InvoiceLine, InvoiceNumber, Project or any payment table.
--
-- After a successful run, delete this migration's row from "_prisma_migrations" so the history matches the schema:
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261105120000_add_invoice_gst_snapshot';
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF (SELECT count(*) FROM "InvoiceGstSnapshot") > 0 THEN
    RAISE EXCEPTION 'InvoiceGstSnapshot holds % row(s) that cannot be re-derived - refusing to drop it', (SELECT count(*) FROM "InvoiceGstSnapshot");
  END IF;
END $$;
DROP TABLE "InvoiceGstSnapshot";
COMMIT;
