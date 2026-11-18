-- =============================================================================
-- PMO Portal - Global Multi-Country Phase 1: country configuration (data step S1)
-- STATUS: writes data. NEVER run against production without explicit approval, a backup and the record counts reviewed.
--
-- Fills the new Region configuration columns (code, displayName, defaultCurrency) for the existing regions, matched by their
-- STORED name. It never changes Region.name (the key that user grants and Project.prCategory depend on), never inserts or
-- deletes a region, and only fills a column that is still NULL, so it is safe to run twice and never overwrites a value an
-- administrator set later.
--
-- FZE: the country is correctly named FZE. The stored name is still "FZI" until the audited rename (decision O-31), so the
-- row is matched on "FZI" and gets displayName "FZE" (and code "fze") without renaming anything.
--
-- Default currencies are the confirmed regional defaults (India INR, FZE AED, Abu Dhabi AED, Oman OMR, Qatar QAR, Elixir
-- Qatar QAR). Malaysia MYR (confirmed by the user 2026-11-17).
-- timezone is left NULL everywhere: country timezones and calendars are an open decision.
-- =============================================================================

-- ---- 1. Preview (read-only): what each region will look like ------------------------------------------------------------
SELECT r."name" AS stored_name, r."code" AS current_code, r."displayName" AS current_display, r."defaultCurrency" AS current_currency,
       v.code AS new_code, v.display AS new_display, v.currency AS new_currency
FROM "Region" r
LEFT JOIN (VALUES
  ('India',        'india',         'India',        'INR'),
  ('Oman',         'oman',          'Oman',         'OMR'),
  ('Qatar',        'qatar',         'Qatar',        'QAR'),
  ('Elixir Qatar', 'elixir-qatar',  'Elixir Qatar', 'QAR'),
  ('Abu Dhabi',    'abu-dhabi',     'Abu Dhabi',    'AED'),
  ('FZI',          'fze',           'FZE',          'AED'),
  ('Malaysia',     'malaysia',      'Malaysia',     'MYR')
) AS v(stored_name, code, display, currency) ON v.stored_name = r."name"
ORDER BY r."name";

-- ---- 2. Apply (idempotent) -----------------------------------------------------------------------------------------------
BEGIN;

UPDATE "Region" r
SET "code"            = COALESCE(r."code", v.code),
    "displayName"     = COALESCE(r."displayName", v.display),
    "defaultCurrency" = COALESCE(r."defaultCurrency", v.currency)
FROM (VALUES
  ('India',        'india',         'India',        'INR'),
  ('Oman',         'oman',          'Oman',         'OMR'),
  ('Qatar',        'qatar',         'Qatar',        'QAR'),
  ('Elixir Qatar', 'elixir-qatar',  'Elixir Qatar', 'QAR'),
  ('Abu Dhabi',    'abu-dhabi',     'Abu Dhabi',    'AED'),
  ('FZI',          'fze',           'FZE',          'AED'),
  ('Malaysia',     'malaysia',      'Malaysia',     'MYR')
) AS v(stored_name, code, display, currency)
WHERE r."name" = v.stored_name;

-- Verify before committing: every named region now has a code and a display name; names are unchanged.
SELECT r."name", r."code", r."displayName", r."defaultCurrency", r."isActive" FROM "Region" r ORDER BY r."name";

COMMIT;

-- ---- 3. Rollback (data only; the columns themselves are dropped by the migration's own rollback) ------------------------
-- UPDATE "Region" SET "code" = NULL, "displayName" = NULL, "defaultCurrency" = NULL
-- WHERE "name" IN ('India','Oman','Qatar','Elixir Qatar','Abu Dhabi','FZI','Malaysia');
