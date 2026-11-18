-- =============================================================================
-- PMO Portal - Global Multi-Country Phase 2: existing-project classification gap report
-- STATUS: SELECT only. Writes nothing, changes no PR Category, no PR Number, no country. Prints counts and category text only: no project
-- names, client names, PR numbers or user data.
--
-- Purpose: before COUNTRY_ACCESS_MODE is set to enforce, show how existing projects line up with the PR Category -> country mapping, which
-- ones would stay unclassified (reachable only with the explicit All Countries right), and where the stored data is inconsistent. NOTHING
-- is guessed: a project's country is only ever the Region whose stored name equals its stored PR Category. Run against a copy, or against
-- production only with explicit approval. Section 8 of Phase 1's project_region_backfill.sql is the (separate, approved-only) write step.
-- =============================================================================

-- 1. Totals (live = not archived).
SELECT count(*)                                          AS total_projects,
       count(*) FILTER (WHERE NOT "isDeleted")           AS live,
       count(*) FILTER (WHERE "isDeleted")               AS archived,
       count(*) FILTER (WHERE "regionId" IS NOT NULL)    AS with_country,
       count(*) FILTER (WHERE "regionId" IS NULL)        AS without_country
FROM "Project";

-- 2. By stored PR Category: how many projects, how many already carry a country, and whether the category is a known country.
SELECT p."prCategory",
       count(*)                                                AS projects,
       count(*) FILTER (WHERE NOT p."isDeleted")               AS live,
       count(*) FILTER (WHERE p."regionId" IS NOT NULL)        AS with_country,
       count(*) FILTER (WHERE p."regionId" IS NULL)            AS without_country,
       bool_or(r.id IS NOT NULL)                               AS category_is_a_country,
       bool_or(r."isActive")                                   AS country_is_active
FROM "Project" p
LEFT JOIN "Region" r ON r."name" = p."prCategory"
GROUP BY p."prCategory"
ORDER BY p."prCategory";

-- 3. Invalid or unmapped categories: the stored category is blank, or is not the name of any country. These can never be classified
--    automatically and stay unreachable without All Countries until the PMO decides (counts by category text only).
SELECT CASE WHEN btrim(coalesce(p."prCategory", '')) = '' THEN '(blank)' ELSE p."prCategory" END AS category_text,
       count(*) AS projects,
       count(*) FILTER (WHERE NOT p."isDeleted") AS live
FROM "Project" p
WHERE NOT EXISTS (SELECT 1 FROM "Region" r WHERE r."name" = p."prCategory")
GROUP BY 1
ORDER BY projects DESC, category_text;

-- 4. Categories that exist in the application but have NO active country configured (the mapping would be incomplete).
--    The application's fixed category list is: India, Malaysia, Oman, Abu Dhabi, FZI (shown as FZE), Elixir Qatar, Qatar.
SELECT c.category, r.id IS NOT NULL AS has_region_row, coalesce(r."isActive", false) AS region_active
FROM (VALUES ('India'), ('Malaysia'), ('Oman'), ('Abu Dhabi'), ('FZI'), ('Elixir Qatar'), ('Qatar')) AS c(category)
LEFT JOIN "Region" r ON r."name" = c.category
WHERE r.id IS NULL OR NOT r."isActive";

-- 5. Conflicts: a project already carries a country that differs from its own stored category (needs a human decision; nothing is changed).
SELECT count(*) AS country_differs_from_category
FROM "Project" p
JOIN "Region" r ON r.id = p."regionId"
WHERE r."name" <> p."prCategory";

-- 6. Prefix disagreement (information only; the country is NOT taken from the prefix). Counts per stored category whose PR number does
--    not start with that category's own prefix.
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

-- 7. The Oman "EE" / Elixir Qatar "EE-Q-" overlap (accepted business decision C-18): how EE-prefixed projects are classified. A row where the
--    category and the "-Q-" part disagree is listed as a count, never reclassified.
SELECT p."prCategory",
       count(*) FILTER (WHERE p."prNo" LIKE 'EE-Q-%')                            AS prefix_ee_q,
       count(*) FILTER (WHERE p."prNo" LIKE 'EE%' AND p."prNo" NOT LIKE 'EE-Q-%') AS prefix_ee_other
FROM "Project" p
WHERE p."prNo" LIKE 'EE%'
GROUP BY p."prCategory"
ORDER BY p."prCategory";

-- 8. Duplicates and ambiguity: live PR Numbers that repeat (ignoring case and surrounding spaces), and whether the repeats span countries.
SELECT count(*) AS duplicated_pr_numbers,
       count(*) FILTER (WHERE countries > 1) AS spanning_more_than_one_country
FROM (
  SELECT lower(btrim(p."prNo")) AS k, count(*) AS n, count(DISTINCT coalesce(p."regionId"::text, p."prCategory")) AS countries
  FROM "Project" p
  WHERE NOT p."isDeleted"
  GROUP BY 1
  HAVING count(*) > 1
) d;

-- 9. Summary for the PMO: what would still need a manual classification decision (unmapped category + conflicts), live projects only.
SELECT (SELECT count(*) FROM "Project" p WHERE NOT p."isDeleted" AND NOT EXISTS (SELECT 1 FROM "Region" r WHERE r."name" = p."prCategory")) AS live_unmapped_category,
       (SELECT count(*) FROM "Project" p JOIN "Region" r ON r.id = p."regionId" WHERE NOT p."isDeleted" AND r."name" <> p."prCategory")      AS live_country_differs_from_category,
       (SELECT count(*) FROM "Project" p WHERE NOT p."isDeleted" AND p."regionId" IS NULL
          AND EXISTS (SELECT 1 FROM "Region" r WHERE r."name" = p."prCategory"))                                                              AS live_can_be_backfilled_from_category;
