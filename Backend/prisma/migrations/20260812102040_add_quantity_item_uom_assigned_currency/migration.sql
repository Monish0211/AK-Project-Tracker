-- AlterTable
ALTER TABLE "QuantityItem" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "uom" TEXT NOT NULL DEFAULT '';
