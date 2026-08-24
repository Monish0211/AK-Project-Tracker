-- AlterTable
ALTER TABLE "TimesheetEntry" ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "startTime" TEXT;

-- AlterTable
ALTER TABLE "TimesheetImportRowLog" ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "startTime" TEXT;
