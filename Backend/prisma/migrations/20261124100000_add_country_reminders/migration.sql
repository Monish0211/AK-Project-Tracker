-- Country-wise reminders (additive; nothing existing is altered or rewritten).
--
--   CountryReminderSetting       one row per (country, reminder type). Only the project reminder alerts switch exists; the two Weekly Emails stay global and are NOT
--                                configured per country.
--   CountryReminderSettingAudit  every change: who, which country, previous and new configuration, when.
--   CountryReminder              an important reminder that belongs to exactly one country (Region), independent of any project.
--
-- No country is inferred anywhere: every row names its Region. Existing project reminders keep their project (and so the project's stored country).
-- Rollback (only if nothing has been saved): DROP TABLE "CountryReminder", "CountryReminderSettingAudit", "CountryReminderSetting";

CREATE TABLE "CountryReminderSetting" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "regionId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryReminderSetting_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CountryReminderSetting_type_chk" CHECK ("reminderType" IN ('PROJECT_REMINDERS'))
);

CREATE UNIQUE INDEX "CountryReminderSetting_regionId_reminderType_key" ON "CountryReminderSetting"("regionId", "reminderType");
CREATE INDEX "CountryReminderSetting_reminderType_enabled_idx" ON "CountryReminderSetting"("reminderType", "enabled");
ALTER TABLE "CountryReminderSetting" ADD CONSTRAINT "CountryReminderSetting_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CountryReminderSettingAudit" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "regionId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountryReminderSettingAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CountryReminderSettingAudit_regionId_createdAt_idx" ON "CountryReminderSettingAudit"("regionId", "createdAt");
ALTER TABLE "CountryReminderSettingAudit" ADD CONSTRAINT "CountryReminderSettingAudit_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CountryReminder" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "regionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reminderDate" DATE NOT NULL,
    "reminderTime" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryReminder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CountryReminder_time_chk" CHECK ("reminderTime" IS NULL OR "reminderTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "CountryReminder_priority_chk" CHECK ("priority" IN ('Low', 'Normal', 'High', 'Critical'))
);

CREATE INDEX "CountryReminder_regionId_reminderDate_idx" ON "CountryReminder"("regionId", "reminderDate");
ALTER TABLE "CountryReminder" ADD CONSTRAINT "CountryReminder_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
