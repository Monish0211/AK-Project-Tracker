-- AlterTable
ALTER TABLE "InvoiceRequest" ADD COLUMN     "address" TEXT,
ADD COLUMN     "copiesRequired" TEXT,
ADD COLUMN     "drawingsAvailable" TEXT,
ADD COLUMN     "invoiceAmountNote" TEXT,
ADD COLUMN     "printingDetails" TEXT;
