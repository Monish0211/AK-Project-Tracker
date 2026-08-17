-- CreateTable
CREATE TABLE "TimesheetEntry" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "employeeNo" TEXT NOT NULL,
    "projectId" TEXT,
    "rawProjectCode" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "task" TEXT NOT NULL DEFAULT '',
    "hours" DOUBLE PRECISION NOT NULL,
    "sourceStatus" TEXT NOT NULL DEFAULT 'Active',
    "firstImportId" TEXT NOT NULL,
    "lastImportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetImport" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "emailMessageId" TEXT,
    "attachmentId" TEXT,
    "attachmentFilename" TEXT,
    "receivedAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "processingFinishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "removedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetImportRowLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "importId" TEXT NOT NULL,
    "entryId" TEXT,
    "rawEmployeeNo" TEXT NOT NULL,
    "rawProjectCode" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "task" TEXT NOT NULL,
    "previousHours" DOUBLE PRECISION,
    "newHours" DOUBLE PRECISION,
    "outcome" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetImportRowLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimesheetEntry_employeeNo_projectId_workDate_task_idx" ON "TimesheetEntry"("employeeNo", "projectId", "workDate", "task");

-- CreateIndex
CREATE INDEX "TimesheetEntry_projectId_idx" ON "TimesheetEntry"("projectId");

-- CreateIndex
CREATE INDEX "TimesheetEntry_employeeNo_idx" ON "TimesheetEntry"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetImport_emailMessageId_key" ON "TimesheetImport"("emailMessageId");

-- CreateIndex
CREATE INDEX "TimesheetImport_receivedAt_idx" ON "TimesheetImport"("receivedAt");

-- CreateIndex
CREATE INDEX "TimesheetImport_status_idx" ON "TimesheetImport"("status");

-- CreateIndex
CREATE INDEX "TimesheetImportRowLog_importId_idx" ON "TimesheetImportRowLog"("importId");

-- CreateIndex
CREATE INDEX "TimesheetImportRowLog_entryId_idx" ON "TimesheetImportRowLog"("entryId");

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_firstImportId_fkey" FOREIGN KEY ("firstImportId") REFERENCES "TimesheetImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_lastImportId_fkey" FOREIGN KEY ("lastImportId") REFERENCES "TimesheetImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetImportRowLog" ADD CONSTRAINT "TimesheetImportRowLog_importId_fkey" FOREIGN KEY ("importId") REFERENCES "TimesheetImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetImportRowLog" ADD CONSTRAINT "TimesheetImportRowLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TimesheetEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
