-- =============================================================================
-- PMO Portal - Global Multi-Country Phase 1: Project.regionId backfill (data step S2)
-- STATUS: section 1 is read-only; section 2 writes data. NEVER run section 2 against production without explicit approval,
-- a backup and the section 1 counts reviewed by the PMO.
--
-- A project's country is taken ONLY from its stored PR Category (Project.prCategory), by exact match to the stored region
-- name. It is never inferred from the PR number prefix and never from the creator. Rows that do not match stay NULL and are
-- reported: nothing is guessed, nothing is corrected, no PR Category or PR number is changed.
--
-- Run section 1 first and review it. Run section 2 only to fill rows that are still NULL (idempotent). Section 3 undoes it.
-- =============================================================================

-- ---- 1. Dry run (read-only) -------------------------------------------------------------------------------------------
-- 1a. How many projects would be linked, per category (live and archived).
SELECT p."prCategory",
       count(*)                                          AS projects,
       count(*) FILTER (WHERE NOT p."isDeleted")         AS live,
       count(*) FILTER (WHERE r.id IS NOT NULL)          AS would_link,
       count(*) FILTER (WHERE r.id IS NULL)              AS unmatched
FROM "Project" p
LEFT JOIN "Region" r ON r."name" = p."prCategory"
GROUP BY p."prCategory"
ORDER BY p."prCategory";

-- 1b. Projects that would stay unclassified (category is not an exact region name). Counts only; no names or numbers.
SELECT count(*) AS unmatched_projects FROM "Project" p WHERE NOT EXISTS (SELECT 1 FROM "Region" r WHERE r."name" = p."prCategory");

-- 1c. Information only: projects whose PR number does not start with their own category's prefix. The country is NOT taken
-- from the prefix; this is only so the PMO can see where the stored category and the number disagree.
SELECT p."prCategory", count(*) AS prefix_disagrees
FROM "Project" p
WHERE CASE p."prCategory"
        WHEN 'India' THEN left(p."prNo", 3) <> 'PR-'
        WHEN 'Malaysia' THEN left(p."prNo", 4) <> 'MYPR'
        WHEN 'Oman' THEN left(p."prNo", 2) <> 'EE'
        WHEN 'Abu Dhabi' THEN left(p."prNo", 5) <> 'PRAD-'
        WHEN 'FZI' THEN left(p."prNo", 4) <> 'PRI-'
        WHEN 'Elixir Qatar' THEN left(p."prNo", 5) <> 'EE-Q-'
        WHEN 'Qatar' THEN left(p."prNo", 5) <> 'Q-PR-'
        ELSE FALSE
      END
GROUP BY p."prCategory"
ORDER BY p."prCategory";

-- ---- 2. Apply (idempotent; fills only rows that are still NULL) ---------------------------------------------------------
-- BEGIN;
-- UPDATE "Project" p
-- SET "regionId" = r.id
-- FROM "Region" r
-- WHERE r."name" = p."prCategory" AND p."regionId" IS NULL;
-- -- verify: linked / still NULL
-- SELECT count(*) FILTER (WHERE "regionId" IS NOT NULL) AS linked, count(*) FILTER (WHERE "regionId" IS NULL) AS unclassified FROM "Project";
-- COMMIT;

-- ---- 3. Rollback ---------------------------------------------------------------------------------------------------------
-- UPDATE "Project" SET "regionId" = NULL;
