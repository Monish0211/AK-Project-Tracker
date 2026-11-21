-- Weekly email report exclusions (Nov 2026). ADDITIVE ONLY: one new table, nothing existing is changed.
--
-- An Administrator can take a project out of one weekly email report ("Projects Missing Other Project Expenses" or
-- "Invoices Unpaid for 30+ Days") until an Administrator restores it. This is a REPORT-LEVEL setting only: no project,
-- invoice, expense or payment row is read for writing or changed.
--
-- One row per exclusion. Restoring fills the restored* columns of that same row (never a delete), so the history keeps
-- who excluded and who restored, and when. A project can be excluded again later: that is a new row.
--   * At most ONE active (not restored) exclusion per project and report: partial unique index.
--   * The history is permanent: rows are never deleted, and once restored a row never changes again (trigger).
--   * projectId / actor ids carry no foreign key (like InvoiceLineDeletion), so the history survives a project or user
--     being removed; prNo / projectTitle / client / actor names are snapshots taken at the time.
--   * excludedAt / restoredAt are plain TIMESTAMP(3) (UTC) written by the application, like most of this schema - NOT
--     timestamptz: through the pg driver adapter a timestamptz value is shifted by the database session's UTC offset
--     whenever that time zone is not UTC.
--
-- Rollback (code first): DROP TABLE "WeeklyReportExclusion"; DROP FUNCTION "WeeklyReportExclusion_guard"();
-- Older code never reads this table, so a code-only rollback can leave it in place.

CREATE TABLE "WeeklyReportExclusion" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
  "projectId"        TEXT NOT NULL,
  "reportType"       TEXT NOT NULL,
  "prNo"             TEXT NOT NULL,
  "projectTitle"     TEXT NOT NULL,
  "client"           TEXT NOT NULL,
  "excludedByUserId" TEXT NOT NULL,
  "excludedByName"   TEXT NOT NULL,
  "excludedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restoredByUserId" TEXT,
  "restoredByName"   TEXT,
  "restoredAt"       TIMESTAMP(3),
  CONSTRAINT "WeeklyReportExclusion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WeeklyReportExclusion_reportType_chk"
    CHECK ("reportType" IN ('missing_other_project_expenses', 'unpaid_invoices_30_days')),
  -- Restored = all three restore fields set; active = none of them.
  CONSTRAINT "WeeklyReportExclusion_restore_chk"
    CHECK (("restoredAt" IS NULL AND "restoredByUserId" IS NULL AND "restoredByName" IS NULL)
        OR ("restoredAt" IS NOT NULL AND "restoredByUserId" IS NOT NULL AND "restoredByName" IS NOT NULL))
);

-- No duplicate ACTIVE exclusion; also the lookup used by every report build.
CREATE UNIQUE INDEX "WeeklyReportExclusion_active_key" ON "WeeklyReportExclusion" ("projectId", "reportType") WHERE "restoredAt" IS NULL;
-- Excluded History: one report's rows, active or restored, newest first.
CREATE INDEX "WeeklyReportExclusion_reportType_restoredAt_idx" ON "WeeklyReportExclusion" ("reportType", "restoredAt", "excludedAt");
CREATE INDEX "WeeklyReportExclusion_projectId_idx" ON "WeeklyReportExclusion" ("projectId");

-- Permanent history: never deleted; the only change ever allowed is restoring an active row (filling the three
-- restore fields once). Everything else, including any change to a restored row, is refused.
CREATE FUNCTION "WeeklyReportExclusion_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WeeklyReportExclusion history is permanent: an exclusion is restored, never deleted';
  END IF;
  IF OLD."restoredAt" IS NOT NULL
     OR NEW."restoredAt" IS NULL
     OR NEW."id" <> OLD."id"
     OR NEW."projectId" <> OLD."projectId"
     OR NEW."reportType" <> OLD."reportType"
     OR NEW."prNo" <> OLD."prNo"
     OR NEW."projectTitle" <> OLD."projectTitle"
     OR NEW."client" <> OLD."client"
     OR NEW."excludedByUserId" <> OLD."excludedByUserId"
     OR NEW."excludedByName" <> OLD."excludedByName"
     OR NEW."excludedAt" <> OLD."excludedAt" THEN
    RAISE EXCEPTION 'WeeklyReportExclusion: only restoring an active exclusion is allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WeeklyReportExclusion_no_update" BEFORE UPDATE ON "WeeklyReportExclusion"
  FOR EACH ROW EXECUTE FUNCTION "WeeklyReportExclusion_guard"();
CREATE TRIGGER "WeeklyReportExclusion_no_delete" BEFORE DELETE ON "WeeklyReportExclusion"
  FOR EACH ROW EXECUTE FUNCTION "WeeklyReportExclusion_guard"();
