-- AlterTable
ALTER TABLE "PRRequest" ALTER COLUMN "assignedPmoManagerId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'Draft';
