-- Phase 4 (central country manpower conversion rates). ADDITIVE ONLY. Nothing is recalculated, no existing row's value is read into or changed, and the legacy
-- per-project table "ProjectManhourFxRate" and its history are left exactly as they are (kept as history; no longer written by the application).
--
-- Rollback (all new objects are unread while empty):
--   DROP TABLE "CountryRateApplyTask"; DROP TABLE "CountryRateApplyRun"; DROP TABLE "CountryManhourFxRate";
--   DROP FUNCTION "CountryManhourFxRate_block_change"();
--   ALTER TABLE "ProjectResourceRepriceAudit" DROP COLUMN "regionId", DROP COLUMN "oldFxRateScope", DROP COLUMN "newFxRateScope";
--   ALTER TABLE "ProjectResource" DROP COLUMN "fxRateScope";
--   DELETE FROM "UserModuleAccess" WHERE "moduleId" IN (SELECT id FROM "Module" WHERE name = 'Manpower Conversion Rates');
--   DELETE FROM "Module" WHERE name = 'Manpower Conversion Rates';

-- Which table a stored fxRateVersion points into. NULL on every existing row = a legacy per-project version, so existing converted values keep
-- their meaning and are reviewed (preview) before any country rate moves them.
ALTER TABLE "ProjectResource" ADD COLUMN "fxRateScope" TEXT;

ALTER TABLE "ProjectResourceRepriceAudit"
  ADD COLUMN "regionId" TEXT,
  ADD COLUMN "oldFxRateScope" TEXT,
  ADD COLUMN "newFxRateScope" TEXT;

CREATE TABLE "CountryManhourFxRate" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "regionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "regionalCurrency" TEXT NOT NULL,
    "inrPerRegionalUnit" DECIMAL(18,6) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdByRole" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountryManhourFxRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CountryManhourFxRate_regionId_version_key" ON "CountryManhourFxRate"("regionId", "version");
CREATE INDEX "CountryManhourFxRate_regionId_idx" ON "CountryManhourFxRate"("regionId");
ALTER TABLE "CountryManhourFxRate" ADD CONSTRAINT "CountryManhourFxRate_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A country rate version is never edited and never deleted: a change is a new version.
CREATE FUNCTION "CountryManhourFxRate_block_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CountryManhourFxRate is append-only: add a new version instead of changing or deleting one';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CountryManhourFxRate_no_update" BEFORE UPDATE ON "CountryManhourFxRate"
  FOR EACH ROW EXECUTE FUNCTION "CountryManhourFxRate_block_change"();
CREATE TRIGGER "CountryManhourFxRate_no_delete" BEFORE DELETE ON "CountryManhourFxRate"
  FOR EACH ROW EXECUTE FUNCTION "CountryManhourFxRate_block_change"();

CREATE TABLE "CountryRateApplyRun" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "regionId" TEXT NOT NULL,
    "regionName" TEXT NOT NULL,
    "targetVersion" INTEGER NOT NULL,
    "reason" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "projectCount" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CountryRateApplyRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CountryRateApplyRun_regionId_idx" ON "CountryRateApplyRun"("regionId");
CREATE INDEX "CountryRateApplyRun_status_idx" ON "CountryRateApplyRun"("status");

CREATE TABLE "CountryRateApplyTask" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CountryRateApplyTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CountryRateApplyTask_runId_projectId_key" ON "CountryRateApplyTask"("runId", "projectId");
CREATE INDEX "CountryRateApplyTask_projectId_status_idx" ON "CountryRateApplyTask"("projectId", "status");
CREATE INDEX "CountryRateApplyTask_status_idx" ON "CountryRateApplyTask"("status");
ALTER TABLE "CountryRateApplyTask" ADD CONSTRAINT "CountryRateApplyTask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CountryRateApplyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The new, independent Module Access grant. A lookup-table row (data only), idempotent by the same upsert-by-name convention as the "Add Project" /
-- "PR Request" migration. NOBODY is granted it here: unlike those two, this capability did not exist before, so there is nothing to preserve. An
-- Administrator ticks it per user in Settings > User Management (no role, designation or Manpower grant implies it, Administrators included).
INSERT INTO "Module" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Manpower Conversion Rates', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
