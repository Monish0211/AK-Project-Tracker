-- Multi-country invoice currency (Phase 5). ADDITIVE ONLY: six nullable columns on "InvoiceLine" and CHECK constraints. No existing row is read, changed or
-- reinterpreted: every existing line keeps "projectCurrency" NULL, which the application reads as "an INR or legacy project: invoiceAmountINR is its project amount".
--
-- Rollback (the columns are unread while empty):
--   ALTER TABLE "InvoiceLine" DROP CONSTRAINT "InvoiceLine_project_currency_chk";
--   ALTER TABLE "InvoiceLine" DROP COLUMN "projectCurrency", DROP COLUMN "exchangeRateToProject", DROP COLUMN "invoiceAmountProject",
--     DROP COLUMN "unitPriceProject", DROP COLUMN "calculatedAmountProject", DROP COLUMN "commercialAdjustmentProject";

ALTER TABLE "InvoiceLine"
  ADD COLUMN "projectCurrency" TEXT,
  ADD COLUMN "exchangeRateToProject" DECIMAL(18,8),
  ADD COLUMN "invoiceAmountProject" DECIMAL(18,3),
  ADD COLUMN "unitPriceProject" DECIMAL(18,6),
  ADD COLUMN "calculatedAmountProject" DECIMAL(18,3),
  ADD COLUMN "commercialAdjustmentProject" DECIMAL(18,3);

-- The two shapes a row can have, and nothing in between:
--   * an INR / legacy project line: none of the project-currency columns is set;
--   * a regional line: the project currency (never INR), a positive rate and a non-negative project amount are all set, and the INR-named columns hold
--     no figure (invoiceAmountINR 0, exchangeRateToINR 1, the three other INR-named figures NULL or 0), so a regional amount can never sit in one.
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_project_currency_chk" CHECK (
  (
    "projectCurrency" IS NULL
    AND "exchangeRateToProject" IS NULL AND "invoiceAmountProject" IS NULL AND "unitPriceProject" IS NULL
    AND "calculatedAmountProject" IS NULL AND "commercialAdjustmentProject" IS NULL
  )
  OR (
    "projectCurrency" IS NOT NULL AND "projectCurrency" <> 'INR'
    AND "exchangeRateToProject" IS NOT NULL AND "exchangeRateToProject" > 0
    AND "invoiceAmountProject" IS NOT NULL AND "invoiceAmountProject" >= 0
    AND "invoiceAmountINR" = 0 AND "exchangeRateToINR" = 1
    AND COALESCE("unitPriceINR", 0) = 0 AND COALESCE("calculatedAmountINR", 0) = 0 AND COALESCE("commercialAdjustmentINR", 0) = 0
  )
);
