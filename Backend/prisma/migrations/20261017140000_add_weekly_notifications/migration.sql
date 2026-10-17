-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationCcRecipient" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "settingId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "portalUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationCcRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJobRun" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "jobName" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "claimToken" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "eligibleCount" INTEGER,
    "missingCount" INTEGER,
    "recipientCount" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_key_key" ON "NotificationSetting"("key");

-- CreateIndex
CREATE INDEX "NotificationCcRecipient_settingId_idx" ON "NotificationCcRecipient"("settingId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationCcRecipient_settingId_emailNormalized_key" ON "NotificationCcRecipient"("settingId", "emailNormalized");

-- CreateIndex
CREATE INDEX "ScheduledJobRun_jobName_startedAt_idx" ON "ScheduledJobRun"("jobName", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJobRun_jobName_periodKey_key" ON "ScheduledJobRun"("jobName", "periodKey");

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationCcRecipient" ADD CONSTRAINT "NotificationCcRecipient_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "NotificationSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationCcRecipient" ADD CONSTRAINT "NotificationCcRecipient_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

