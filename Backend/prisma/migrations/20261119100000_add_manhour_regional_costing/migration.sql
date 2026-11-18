-- Global Multi-Country Phase 4: country-aware manpower costing. ADDITIVE ONLY. No existing column is renamed, dropped, retyped or rewritten,
-- no existing row is read or changed, and nothing is recalculated: every existing ProjectResource keeps NULL in the new columns, which means
-- "no regional costing recorded" (an INR project needs none; a non-INR project shows "Rate not set" until an authorized user sets a rate and
-- explicitly applies it). Employee, Timesheet and Keka tables are not touched.
-- Rollback (all new objects are unread when empty):
--   DROP TABLE "ProjectResourceRepriceAudit"; DROP TABLE "ProjectManhourFxRate"; DROP FUNCTION "ProjectManhourFxRate_block_update"();
--   ALTER TABLE "ProjectResource" DROP COLUMN "rateSetAt", DROP COLUMN "manhourCostRegional", DROP COLUMN "fxRateInrPerRegional",
--     DROP COLUMN "fxRateVersion", DROP COLUMN "costingStatus", DROP COLUMN "costCurrency";

ALTER TABLE "ProjectResource"
  ADD COLUMN "costCurrency" TEXT,
  ADD COLUMN "costingStatus" TEXT,
  ADD COLUMN "fxRateVersion" INTEGER,
  ADD COLUMN "fxRateInrPerRegional" DECIMAL(18,6),
  ADD COLUMN "manhourCostRegional" DECIMAL(18,3),
  ADD COLUMN "rateSetAt" TIMESTAMP(3);

-- Per-project manpower conversion rate versions: "1 regional currency unit = X INR". Append-only.
CREATE TABLE "ProjectManhourFxRate" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "regionalCurrency" TEXT NOT NULL,
    "inrPerRegionalUnit" DECIMAL(18,6) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdByRole" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectManhourFxRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectManhourFxRate_projectId_version_key" ON "ProjectManhourFxRate"("projectId", "version");
CREATE INDEX "ProjectManhourFxRate_projectId_idx" ON "ProjectManhourFxRate"("projectId");
ALTER TABLE "ProjectManhourFxRate" ADD CONSTRAINT "ProjectManhourFxRate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A rate version is never edited: a change is a new version. (Deleting a whole project still cascades its versions.)
CREATE FUNCTION "ProjectManhourFxRate_block_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProjectManhourFxRate is append-only: add a new version instead of updating one';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProjectManhourFxRate_no_update" BEFORE UPDATE ON "ProjectManhourFxRate"
  FOR EACH ROW EXECUTE FUNCTION "ProjectManhourFxRate_block_update"();

-- Audit of the explicit "apply rate to existing records" action. Plain ids, no foreign keys, so the trail outlives the rows it describes.
CREATE TABLE "ProjectResourceRepriceAudit" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectResourceId" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "manhourCostInr" DOUBLE PRECISION NOT NULL,
    "oldStatus" TEXT,
    "oldCostCurrency" TEXT,
    "oldFxRateVersion" INTEGER,
    "oldFxRateInrPerRegional" DECIMAL(18,6),
    "oldManhourCostRegional" DECIMAL(18,3),
    "newStatus" TEXT NOT NULL,
    "newCostCurrency" TEXT NOT NULL,
    "newFxRateVersion" INTEGER NOT NULL,
    "newFxRateInrPerRegional" DECIMAL(18,6) NOT NULL,
    "newManhourCostRegional" DECIMAL(18,3) NOT NULL,
    "reason" TEXT,
    "performedByUserId" TEXT,
    "performedByName" TEXT NOT NULL,
    "performedByRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectResourceRepriceAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectResourceRepriceAudit_projectId_idx" ON "ProjectResourceRepriceAudit"("projectId");
CREATE INDEX "ProjectResourceRepriceAudit_runId_idx" ON "ProjectResourceRepriceAudit"("runId");
