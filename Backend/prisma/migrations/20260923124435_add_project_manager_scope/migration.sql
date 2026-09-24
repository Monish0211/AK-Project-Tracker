-- CreateTable
CREATE TABLE "ProjectManagerScope" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectManagerId" TEXT NOT NULL,
    "grantedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectManagerScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectManagerScope_projectManagerId_grantedUserId_key" ON "ProjectManagerScope"("projectManagerId", "grantedUserId");

-- AddForeignKey
ALTER TABLE "ProjectManagerScope" ADD CONSTRAINT "ProjectManagerScope_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectManagerScope" ADD CONSTRAINT "ProjectManagerScope_grantedUserId_fkey" FOREIGN KEY ("grantedUserId") REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
