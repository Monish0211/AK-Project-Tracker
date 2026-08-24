-- CreateIndex
CREATE INDEX "AuthAuditLog_createdAt_idx" ON "AuthAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "InvoiceLine_milestoneId_idx" ON "InvoiceLine"("milestoneId");

-- CreateIndex
CREATE INDEX "Project_prNo_idx" ON "Project"("prNo");

-- CreateIndex
CREATE INDEX "TimesheetImport_createdAt_idx" ON "TimesheetImport"("createdAt");
