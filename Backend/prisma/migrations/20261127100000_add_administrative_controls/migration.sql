-- Administrative Controls (Nov 2026). ADDITIVE ONLY. No existing row is changed, re-read or reinterpreted, and nobody is granted anything.
--
-- 1. Two new approval rights, managed ONLY in Settings > Administrative Controls (Administrator-only, never on yourself, every change audited):
--      "PR Approval Administration" - cross-country PR Request register, edit / approve / reject at the current stage / reassign / delete (not approved)
--      "Invoice Administration"     - raise without the automatic "invoice raised" email; delete a Raised invoice (archived first, number kept reserved)
--    No UserApprovalPermission row is created: the rights start with no holder.
-- 2. PRRequest soft delete (an administrative delete keeps the request and its history; status becomes 'Deleted').
-- 3. PRRequestApprovalHistory."onBehalfOfUserId": the assigned approver an administrator acted for (the actor column stays the real acting user).
-- 4. InvoiceLineDeletion: append-only archive of a Raised invoice line deleted by an administrator - the complete original row is kept, with the
--    reason and the acting administrator. A trigger forbids UPDATE and DELETE (same pattern as CountryManhourFxRate).
--
-- Rollback (code first, then schema):
--   * Safe at any time: DELETE FROM "UserApprovalPermission" WHERE "approvalTypeId" IN (SELECT id FROM "ApprovalType" WHERE name IN
--     ('PR Approval Administration','Invoice Administration')); then the two ApprovalType rows; then the PRRequestApprovalHistory column.
--   * PRRequest columns: only drop them if no request was administratively deleted (SELECT count(*) FROM "PRRequest" WHERE "deletedAt" IS NOT NULL
--     must be 0) - otherwise those requests would lose their deletion record and show status 'Deleted' with no explanation.
--   * InvoiceLineDeletion: NOT safe to drop once it holds rows - it is the only remaining copy of each deleted invoice. Export it first
--     (COPY "InvoiceLineDeletion" TO ...) and keep the export with the backups; to drop it, the triggers must be removed first.

INSERT INTO "ApprovalType" ("id", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'PR Approval Administration', 'View every PR Request in every country; edit, approve or reject at the current stage, reassign approvers and delete requests that are not approved. Every action needs a reason and is recorded.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Invoice Administration', 'Raise an invoice without the automatic "invoice raised" email, and delete a Raised invoice (archived first, its number stays reserved). Paid or partly paid invoices can never be deleted.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "PRRequest"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByUserId" TEXT,
  ADD COLUMN "deleteReason" TEXT;
ALTER TABLE "PRRequest" ADD CONSTRAINT "PRRequest_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- A deleted request always says who, when and why (and only a deleted one carries these).
ALTER TABLE "PRRequest" ADD CONSTRAINT "PRRequest_admin_delete_chk" CHECK (
  ("deletedAt" IS NULL AND "deleteReason" IS NULL)
  OR ("deletedAt" IS NOT NULL AND "deleteReason" IS NOT NULL AND length(btrim("deleteReason")) > 0 AND "status" = 'Deleted')
);

ALTER TABLE "PRRequestApprovalHistory" ADD COLUMN "onBehalfOfUserId" TEXT;
ALTER TABLE "PRRequestApprovalHistory" ADD CONSTRAINT "PRRequestApprovalHistory_onBehalfOfUserId_fkey" FOREIGN KEY ("onBehalfOfUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InvoiceLineDeletion" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "originalLineId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "prNo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "originalRow" JSONB NOT NULL,
    "related" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "deletedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT "InvoiceLineDeletion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoiceLineDeletion_reason_chk" CHECK (length(btrim("reason")) > 0)
);
CREATE INDEX "InvoiceLineDeletion_projectId_idx" ON "InvoiceLineDeletion"("projectId");
CREATE INDEX "InvoiceLineDeletion_invoiceNo_idx" ON "InvoiceLineDeletion"("invoiceNo");
-- Deliberately no foreign key to the project or the actor: the archive must outlive both (a project can be permanently deleted later).

CREATE FUNCTION "InvoiceLineDeletion_block_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'InvoiceLineDeletion is append-only: an archived invoice deletion is never changed or removed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InvoiceLineDeletion_no_update" BEFORE UPDATE ON "InvoiceLineDeletion"
  FOR EACH ROW EXECUTE FUNCTION "InvoiceLineDeletion_block_change"();
CREATE TRIGGER "InvoiceLineDeletion_no_delete" BEFORE DELETE ON "InvoiceLineDeletion"
  FOR EACH ROW EXECUTE FUNCTION "InvoiceLineDeletion_block_change"();
