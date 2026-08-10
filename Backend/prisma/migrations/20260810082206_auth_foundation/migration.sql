-- AlterTable
ALTER TABLE "PortalUser" ADD COLUMN     "accountLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "employeeType" TEXT,
ADD COLUMN     "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetAt" TIMESTAMP(3),
ADD COLUMN     "reportingManagerId" TEXT;

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserModuleAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRegionAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRegionAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApprovalPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approvalTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserApprovalPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Module_name_key" ON "Module"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserModuleAccess_userId_moduleId_key" ON "UserModuleAccess"("userId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserRegionAccess_userId_regionId_key" ON "UserRegionAccess"("userId", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalType_name_key" ON "ApprovalType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserApprovalPermission_userId_approvalTypeId_key" ON "UserApprovalPermission"("userId", "approvalTypeId");

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRegionAccess" ADD CONSTRAINT "UserRegionAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRegionAccess" ADD CONSTRAINT "UserRegionAccess_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApprovalPermission" ADD CONSTRAINT "UserApprovalPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApprovalPermission" ADD CONSTRAINT "UserApprovalPermission_approvalTypeId_fkey" FOREIGN KEY ("approvalTypeId") REFERENCES "ApprovalType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
