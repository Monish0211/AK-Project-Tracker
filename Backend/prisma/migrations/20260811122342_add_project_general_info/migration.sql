-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "poMonth" TEXT NOT NULL,
    "prCategory" TEXT NOT NULL,
    "prNo" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "domesticForeign" TEXT NOT NULL,
    "projectTitle" TEXT NOT NULL,
    "workOrderStatus" TEXT NOT NULL,
    "projectStartDate" TIMESTAMP(3) NOT NULL,
    "projectEndDate" TIMESTAMP(3),
    "projectStatus" TEXT NOT NULL,
    "actualCompletionDate" TIMESTAMP(3),
    "completionRemarks" TEXT,
    "completedBy" TEXT,
    "completedTimestamp" TIMESTAMP(3),
    "workOrderNumber" TEXT,
    "workOrderDate" TIMESTAMP(3),
    "eicName" TEXT,
    "contactNumber" TEXT,
    "emailId" TEXT,
    "estimatedDuration" INTEGER,
    "durationUnit" TEXT,
    "contractType" TEXT NOT NULL DEFAULT 'LUMP SUM',
    "pmoCoordinator" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_isDeleted_idx" ON "Project"("isDeleted");

-- CreateIndex
CREATE INDEX "Project_projectStatus_idx" ON "Project"("projectStatus");

-- CreateIndex
CREATE INDEX "Project_department_idx" ON "Project"("department");

-- CreateIndex
CREATE INDEX "Project_client_idx" ON "Project"("client");

-- CreateIndex
CREATE INDEX "Project_prCategory_idx" ON "Project"("prCategory");
