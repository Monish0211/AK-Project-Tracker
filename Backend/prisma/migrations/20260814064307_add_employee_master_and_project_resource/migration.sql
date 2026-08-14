-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clientCoordinator" TEXT,
ADD COLUMN     "primaryProjectManager" TEXT,
ADD COLUMN     "projectCoordinator" TEXT,
ADD COLUMN     "projectEngineer" TEXT,
ADD COLUMN     "secondaryProjectManager" TEXT;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "employeeNo" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "reportingManager" TEXT,
    "grade" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "manhourExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "dateOfJoining" TIMESTAMP(3),
    "employeeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectResource" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "assignmentStartDate" TIMESTAMP(3),
    "assignmentEndDate" TIMESTAMP(3),
    "assignmentStatus" TEXT NOT NULL DEFAULT 'Active',
    "hourlyRateSnapshot" DOUBLE PRECISION NOT NULL,
    "workingDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manhourCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNo_key" ON "Employee"("employeeNo");

-- CreateIndex
CREATE INDEX "Employee_department_idx" ON "Employee"("department");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "ProjectResource_projectId_idx" ON "ProjectResource"("projectId");

-- CreateIndex
CREATE INDEX "ProjectResource_employeeNo_idx" ON "ProjectResource"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectResource_projectId_employeeNo_key" ON "ProjectResource"("projectId", "employeeNo");

-- AddForeignKey
ALTER TABLE "ProjectResource" ADD CONSTRAINT "ProjectResource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
