-- CreateTable
CREATE TABLE "PRRequest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "requestedByUserId" TEXT NOT NULL,
    "assignedPmoManagerId" TEXT NOT NULL,
    "projectData" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending Accounts Approval',
    "createdProjectId" TEXT,
    "rejectedByUserId" TEXT,
    "rejectionReason" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PRRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PRRequestApprovalHistory" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "prRequestId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PRRequestApprovalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PRRequestApproverConfig" (
    "id" TEXT NOT NULL,
    "accountsApproverId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PRRequestApproverConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PRRequest_createdProjectId_key" ON "PRRequest"("createdProjectId");

-- CreateIndex
CREATE INDEX "PRRequest_requestedByUserId_idx" ON "PRRequest"("requestedByUserId");

-- CreateIndex
CREATE INDEX "PRRequest_assignedPmoManagerId_idx" ON "PRRequest"("assignedPmoManagerId");

-- CreateIndex
CREATE INDEX "PRRequest_status_idx" ON "PRRequest"("status");

-- CreateIndex
CREATE INDEX "PRRequestApprovalHistory_prRequestId_idx" ON "PRRequestApprovalHistory"("prRequestId");

-- AddForeignKey
ALTER TABLE "PRRequest" ADD CONSTRAINT "PRRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PRRequest" ADD CONSTRAINT "PRRequest_assignedPmoManagerId_fkey" FOREIGN KEY ("assignedPmoManagerId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PRRequest" ADD CONSTRAINT "PRRequest_createdProjectId_fkey" FOREIGN KEY ("createdProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PRRequest" ADD CONSTRAINT "PRRequest_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PRRequestApprovalHistory" ADD CONSTRAINT "PRRequestApprovalHistory_prRequestId_fkey" FOREIGN KEY ("prRequestId") REFERENCES "PRRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PRRequestApprovalHistory" ADD CONSTRAINT "PRRequestApprovalHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PRRequestApproverConfig" ADD CONSTRAINT "PRRequestApproverConfig_accountsApproverId_fkey" FOREIGN KEY ("accountsApproverId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
