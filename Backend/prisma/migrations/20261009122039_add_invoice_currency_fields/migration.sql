-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "exchangeRateToINR" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "invoiceAmountOriginal" DOUBLE PRECISION;

-- DataMigration: explicit historical backfill, not left to inference.
-- Every pre-existing InvoiceLine row was created before this feature
-- existed, by an application that has only ever produced INR amounts in
-- invoiceAmountINR (confirmed by the Invoice Currency audit: no consumer,
-- frontend or backend, ever treated this field as anything but INR). This
-- backfill explicitly asserts that confirmed fact rather than leaving
-- invoiceAmountOriginal implicitly null/ambiguous. currency/
-- exchangeRateToINR already get the correct values from the ADD COLUMN
-- DEFAULTs above for every existing row.
UPDATE "InvoiceLine" SET "invoiceAmountOriginal" = "invoiceAmountINR" WHERE "invoiceAmountOriginal" IS NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "invoiceCurrency" TEXT;
