-- Phase 4 final (regional Liquidated Damages). ADDITIVE ONLY. No existing value is read, changed or reinterpreted: every existing LD row keeps its
-- "ldAmountINR" untouched and gets "ldCurrency" = NULL, which the application reads as "legacy record: a rupee amount typed before regional LD existed".
--
-- Rollback (both columns are unread while empty):
--   ALTER TABLE "Project" DROP CONSTRAINT "Project_ld_currency_columns_chk";
--   ALTER TABLE "Project" DROP COLUMN "ldAmountRegional", DROP COLUMN "ldCurrency";

ALTER TABLE "Project" ADD COLUMN "ldCurrency" TEXT;
ALTER TABLE "Project" ADD COLUMN "ldAmountRegional" DECIMAL(18,3);

-- A rupee amount and a regional amount never coexist, and a regional amount always names its currency (never 'INR'). Existing rows satisfy this
-- (ldCurrency and ldAmountRegional are NULL).
ALTER TABLE "Project" ADD CONSTRAINT "Project_ld_currency_columns_chk" CHECK (
  ("ldAmountRegional" IS NULL OR ("ldCurrency" IS NOT NULL AND "ldCurrency" <> 'INR' AND "ldAmountINR" IS NULL))
  AND ("ldCurrency" IS NULL OR "ldCurrency" = 'INR' OR "ldAmountINR" IS NULL)
);
