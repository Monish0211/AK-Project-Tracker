-- Phase 4 / Option A: automatic manpower recalculation when an employee's hourly rate changes. ADDITIVE ONLY: three new tables, no existing
-- column or row is read, changed or rewritten, and nothing is recalculated by this migration. Employee, Timesheet and Keka tables are untouched.
-- Rollback (all new objects are unread when empty): DROP TABLE "ManhourCostChangeAudit"; DROP TABLE "ManhourRefreshTask"; DROP TABLE "ManhourRateChangeRun";

CREATE TABLE "ManhourRateChangeRun" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "employeeNo" TEXT NOT NULL,
    "previousEmployeeNo" TEXT,
    "previousRate" DOUBLE PRECISION,
    "newRate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
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

    CONSTRAINT "ManhourRateChangeRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManhourRateChangeRun_employeeNo_idx" ON "ManhourRateChangeRun"("employeeNo");
CREATE INDEX "ManhourRateChangeRun_status_idx" ON "ManhourRateChangeRun"("status");

CREATE TABLE "ManhourRefreshTask" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ManhourRefreshTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManhourRefreshTask_runId_projectId_key" ON "ManhourRefreshTask"("runId", "projectId");
CREATE INDEX "ManhourRefreshTask_projectId_status_idx" ON "ManhourRefreshTask"("projectId", "status");
CREATE INDEX "ManhourRefreshTask_status_idx" ON "ManhourRefreshTask"("status");
ALTER TABLE "ManhourRefreshTask" ADD CONSTRAINT "ManhourRefreshTask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ManhourRateChangeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ManhourCostChangeAudit" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "runId" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT NOT NULL,
    "projectResourceId" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "totalHours" DOUBLE PRECISION NOT NULL,
    "previousRate" DOUBLE PRECISION NOT NULL,
    "newRate" DOUBLE PRECISION NOT NULL,
    "previousCostInr" DOUBLE PRECISION NOT NULL,
    "newCostInr" DOUBLE PRECISION NOT NULL,
    "costCurrency" TEXT,
    "fxRateVersion" INTEGER,
    "fxRateInrPerRegional" DECIMAL(18,6),
    "previousCostRegional" DECIMAL(18,3),
    "newCostRegional" DECIMAL(18,3),
    "previousCostingStatus" TEXT,
    "newCostingStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManhourCostChangeAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManhourCostChangeAudit_runId_idx" ON "ManhourCostChangeAudit"("runId");
CREATE INDEX "ManhourCostChangeAudit_projectId_idx" ON "ManhourCostChangeAudit"("projectId");
CREATE INDEX "ManhourCostChangeAudit_employeeNo_idx" ON "ManhourCostChangeAudit"("employeeNo");
