-- Administrative Controls - "Raise invoice without sending email" records (Nov 2026). ADDITIVE ONLY: nothing existing is changed.
--
-- 1. InvoiceStatusEvent.details: optional JSON for events that need more than a status pair. Used only by the new EMAIL_SUPPRESSED event
--    (operation Raised / Paid, which automatic emails were intentionally not sent, related Invoice Requests). Every existing event keeps NULL.
-- 2. InvoiceRequest: the outcome of the two automatic workflow emails, kept apart from the existing "emailStatus" (which records the
--    assignment email sent when the request is created and is never overwritten here):
--      raisedEmail* - the "Invoice Raised Successfully" email when an invoice fulfils the request
--      finalEmail*  - the "Invoice Paid" email when that invoice becomes Paid (the request's final workflow email). Deliberately not named
--                     "paid...": the invoice tables carry no payment-like column (payments live only in the InvoicePayment* tables).
--    Values: sent | failed | suppressed (an administrator raised without email). NULL = not reached yet, or before this release.
--
-- Rollback (code first): ALTER TABLE "InvoiceStatusEvent" DROP COLUMN "details"; ALTER TABLE "InvoiceRequest" DROP COLUMN "raisedEmailStatus",
-- DROP COLUMN "raisedEmailDetail", DROP COLUMN "raisedEmailUpdatedAt", DROP COLUMN "finalEmailStatus", DROP COLUMN "finalEmailDetail",
-- DROP COLUMN "finalEmailUpdatedAt". Older code never reads these columns, so a code-only rollback can leave them in place.

ALTER TABLE "InvoiceStatusEvent" ADD COLUMN "details" JSONB;

ALTER TABLE "InvoiceRequest"
  ADD COLUMN "raisedEmailStatus" TEXT,
  ADD COLUMN "raisedEmailDetail" TEXT,
  ADD COLUMN "raisedEmailUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "finalEmailStatus" TEXT,
  ADD COLUMN "finalEmailDetail" TEXT,
  ADD COLUMN "finalEmailUpdatedAt" TIMESTAMP(3);

ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_raisedEmailStatus_chk"
  CHECK ("raisedEmailStatus" IS NULL OR "raisedEmailStatus" IN ('sent', 'failed', 'suppressed'));
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_finalEmailStatus_chk"
  CHECK ("finalEmailStatus" IS NULL OR "finalEmailStatus" IN ('sent', 'failed', 'suppressed'));
