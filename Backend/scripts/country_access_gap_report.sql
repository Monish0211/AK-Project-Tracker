-- =============================================================================
-- PMO Portal - Global Multi-Country Phase 1: country access gap report
-- STATUS: SELECT only. Writes nothing. Prints counts and role names only: no names, emails or project data.
--
-- Purpose: show, BEFORE COUNTRY_ACCESS_MODE is ever set to enforce, who would lose project data and which projects would become
-- unreachable. The boundary adds a country check to the existing rules; it never grants anything. Run it against a copy or against
-- production only with explicit approval.
-- =============================================================================

-- 1. Active accounts with NO country access (no grant, no All Countries right). In enforce mode these see no project data and get the
--    access-not-configured page. Administrator and PMO Manager accounts here need an explicit assignment before enforcement (O-03).
SELECT ro."name" AS role, count(*) AS accounts_without_country_access
FROM "PortalUser" u
JOIN "PortalRole" ro ON ro.id = u."roleId"
WHERE u."isActive" AND NOT u."allCountriesAccess"
  AND NOT EXISTS (SELECT 1 FROM "UserRegionAccess" a JOIN "Region" r ON r.id = a."regionId" AND r."isActive" WHERE a."userId" = u.id)
GROUP BY ro."name"
ORDER BY accounts_without_country_access DESC, role;

-- 2. Active accounts by how their country access is configured.
SELECT CASE
         WHEN u."allCountriesAccess" THEN 'All Countries (explicit)'
         WHEN n = 0 THEN 'none'
         WHEN n = 1 THEN 'one country'
         ELSE 'several countries'
       END AS configuration,
       count(*) AS accounts
FROM (
  SELECT u.*, (SELECT count(*) FROM "UserRegionAccess" a JOIN "Region" r ON r.id = a."regionId" AND r."isActive" WHERE a."userId" = u.id) AS n
  FROM "PortalUser" u WHERE u."isActive"
) u
GROUP BY 1
ORDER BY 2 DESC;

-- 3. Users per country (active accounts, active countries).
SELECT coalesce(r."displayName", r."name") AS country, r."code", r."defaultCurrency", count(u.id) AS users_with_access
FROM "Region" r
LEFT JOIN "UserRegionAccess" a ON a."regionId" = r.id
LEFT JOIN "PortalUser" u ON u.id = a."userId" AND u."isActive"
WHERE r."isActive"
GROUP BY r.id
ORDER BY country;

-- 4. Projects by country, including how many are not yet classified (regionId NULL). In enforce mode an unclassified project is
--    reachable only with All Countries, so this is the size of that group (O-05 / backfill).
SELECT coalesce(r."displayName", r."name", '(unclassified)') AS country,
       count(*) AS projects,
       count(*) FILTER (WHERE NOT p."isDeleted") AS live
FROM "Project" p
LEFT JOIN "Region" r ON r.id = p."regionId"
GROUP BY 1
ORDER BY 1;

-- 5. Projects whose creator holds no access to the project's country (their own projects would be hidden from them in enforce mode).
SELECT ro."name" AS creator_role, count(*) AS projects_hidden_from_their_creator
FROM "Project" p
JOIN "PortalUser" u ON u.id = p."createdByUserId"
JOIN "PortalRole" ro ON ro.id = u."roleId"
WHERE NOT p."isDeleted" AND p."regionId" IS NOT NULL AND NOT u."allCountriesAccess"
  AND NOT EXISTS (SELECT 1 FROM "UserRegionAccess" a WHERE a."userId" = u.id AND a."regionId" = p."regionId")
GROUP BY ro."name"
ORDER BY projects_hidden_from_their_creator DESC;

-- 6. Live projects with no creator (visible to every user today) that are not classified: unreachable without All Countries in enforce mode.
SELECT count(*) AS unclaimed_and_unclassified
FROM "Project" p
WHERE NOT p."isDeleted" AND p."createdByUserId" IS NULL AND p."regionId" IS NULL;

-- 7. Regions with no code or display name yet (the configuration script has not been run, or a new country was added without one).
SELECT "name", "code", "displayName", "defaultCurrency" FROM "Region" WHERE "code" IS NULL OR "displayName" IS NULL ORDER BY "name";
