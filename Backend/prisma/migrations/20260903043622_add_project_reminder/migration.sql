-- CreateTable
CREATE TABLE "ProjectReminder" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reminderType" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reminderDate" TIMESTAMP(3) NOT NULL,
    "reminderTime" TEXT NOT NULL,
    "notifyOffset" TEXT NOT NULL,
    "repeat" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedDate" TIMESTAMP(3),
    "notificationGenerated" BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectReminder_projectId_idx" ON "ProjectReminder"("projectId");

-- CreateIndex
CREATE INDEX "ProjectReminder_status_idx" ON "ProjectReminder"("status");

-- AddForeignKey
ALTER TABLE "ProjectReminder" ADD CONSTRAINT "ProjectReminder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
