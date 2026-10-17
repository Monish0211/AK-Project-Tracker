-- Liquidated Damages (Oct 2026): recorded once when a project is marked
-- Completed. Additive, nullable columns only — no backfill: existing
-- completed projects keep ldApplicable = NULL ("not recorded").

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ldAmountINR" DECIMAL(14,2),
ADD COLUMN     "ldApplicable" BOOLEAN,
ADD COLUMN     "ldRecordedAt" TIMESTAMP(3),
ADD COLUMN     "ldRecordedByUserId" TEXT,
ADD COLUMN     "ldRemarks" TEXT;
