-- Global Multi-Country Phase 3: regional currency. ADDITIVE ONLY: three nullable columns, no existing column is renamed, dropped,
-- retyped or rewritten, and no data is read or changed. A NULL regional currency means "legacy project": it behaves exactly as before
-- (INR is its regional currency), so every existing project and every existing INR-named amount is untouched.
-- Rollback: the columns are nullable and unread when empty, so rollback is dropping them in reverse order:
--   ALTER TABLE "QuantityItem" DROP COLUMN "woValueRegional", DROP COLUMN "unitRateRegional";
--   ALTER TABLE "Project" DROP COLUMN "regionalCurrency";

-- Project: the regional currency, taken ONCE from the project's country when the project is created (a snapshot, never read live,
-- so a later change to a country's default currency cannot alter an existing project).
ALTER TABLE "Project" ADD COLUMN "regionalCurrency" TEXT;

-- QuantityItem: the line's price and value in the project's regional currency. The INR-named columns (unitRateINR, woValue) keep
-- holding INR only: they are filled for INR-region projects and are 0 for every other region, never an OMR/MYR/AED/QAR amount.
ALTER TABLE "QuantityItem" ADD COLUMN "unitRateRegional" DOUBLE PRECISION,
ADD COLUMN "woValueRegional" DOUBLE PRECISION;
