-- Project-country time zones for Project Workspace reminders (additive; no existing row is changed).
--
--   "dueAt"     the reminder's exact due instant in UTC, computed by the server from the project's local date + time ("reminderDate" + "reminderTime") in
--               the project country's IANA zone.
--   "timeZone"  the IANA zone that was used (e.g. Asia/Qatar).
--
-- Existing reminders keep NULL in both: they are NOT converted, so none is shifted. They keep their previous behaviour until someone saves a new date or time.
-- Rollback: ALTER TABLE "ProjectReminder" DROP COLUMN "dueAt", DROP COLUMN "timeZone";

ALTER TABLE "ProjectReminder" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "ProjectReminder" ADD COLUMN "timeZone" TEXT;
