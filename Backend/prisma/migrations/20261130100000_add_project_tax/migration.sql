-- Project Tax (Nov 2026) - ADDITIVE ONLY. The Commercial Summary Tax setting for projects outside India. Two nullable columns and one range CHECK;
-- no existing row is changed (NULL = "Not Set"), Project.gstApplicable (India) is untouched, and no calculated amount is stored.
ALTER TABLE "Project" ADD COLUMN "taxApplicable" BOOLEAN,
ADD COLUMN "taxRatePercent" DECIMAL(7,4);

ALTER TABLE "Project" ADD CONSTRAINT "Project_taxRatePercent_check" CHECK ("taxRatePercent" IS NULL OR ("taxRatePercent" >= 0 AND "taxRatePercent" <= 100));
