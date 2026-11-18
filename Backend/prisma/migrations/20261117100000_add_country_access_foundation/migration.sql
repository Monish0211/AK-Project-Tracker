-- Global Multi-Country Phase 1: country access foundation. ADDITIVE ONLY: nullable or defaulted columns, no data is read,
-- rewritten or removed, and nothing here changes behaviour until COUNTRY_ACCESS_MODE is set to shadow or enforce.
-- Rollback: drop the objects below in reverse order (they hold no data that anything else depends on yet).

-- Region: country configuration (all nullable; filled by scripts/country_config_seed.sql, never by this migration)
ALTER TABLE "Region" ADD COLUMN "code" TEXT,
ADD COLUMN "displayName" TEXT,
ADD COLUMN "defaultCurrency" TEXT,
ADD COLUMN "timezone" TEXT;

CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- PortalUser: the explicit All Countries right (default false for every existing user)
ALTER TABLE "PortalUser" ADD COLUMN "allCountriesAccess" BOOLEAN NOT NULL DEFAULT false;

-- Project: the project's country (nullable; filled by scripts/project_region_backfill.sql from the stored PR Category only)
ALTER TABLE "Project" ADD COLUMN "regionId" TEXT;

CREATE INDEX "Project_regionId_idx" ON "Project"("regionId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AuthAuditLog: before/after values for security events that need them (country access changes)
ALTER TABLE "AuthAuditLog" ADD COLUMN "details" JSONB;
