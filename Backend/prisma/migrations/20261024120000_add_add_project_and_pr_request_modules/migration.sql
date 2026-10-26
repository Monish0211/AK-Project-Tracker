-- "Add Project" and "PR Request" Module Access grants (Oct 2026).
--
-- Two new, independent rows in the Module lookup table (a lookup TABLE, not an enum, so this is data only — no schema
-- change). Idempotent by the same upsert-by-name convention as prisma/seed.ts and the ApprovalType migrations
-- (20260929104241, 20261013090000, 20261013100000): "Module"."name" is UNIQUE, so ON CONFLICT DO NOTHING makes every
-- INSERT below a no-op when the row already exists.
--
-- "Approvals" is listed too: no earlier migration creates that row (it came only from prisma/seed.ts), and the PR Request
-- backfill below is derived from it. Inserting it with DO NOTHING never duplicates or alters an existing row.
INSERT INTO "Module" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Approvals', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Add Project', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PR Request', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Preserve current capabilities (confirmed business decision). Before this migration:
--   * POST /projects and POST /projects/import were allowed for exactly the users holding the "Projects" module whose
--     role is not "Read Only"  -> they receive "Add Project".
--   * PR Request submission (create/edit/delete a Draft, Send to Accounts) was allowed for exactly the users holding the
--     "Approvals" module whose role is not "Read Only"  -> they receive "PR Request".
-- Nobody else is granted anything, and no existing grant is touched or removed. An Administrator can untick either
-- permission per user afterwards in Settings > User Management.
--
-- Re-run safety: a target module is backfilled ONLY while NOBODY holds it yet (the NOT EXISTS guard). So running this
-- file again after the first run — or after an Administrator has deliberately revoked someone — never re-grants
-- anything. The ON CONFLICT clause additionally makes a duplicate (userId, moduleId) row impossible.
INSERT INTO "UserModuleAccess" ("id", "userId", "moduleId", "createdAt")
SELECT gen_random_uuid(), pu."id", target."id", CURRENT_TIMESTAMP
FROM (VALUES ('Add Project', 'Projects'), ('PR Request', 'Approvals')) AS map("targetName", "sourceName")
JOIN "Module" target ON target."name" = map."targetName"
JOIN "Module" source ON source."name" = map."sourceName"
JOIN "UserModuleAccess" uma ON uma."moduleId" = source."id"
JOIN "PortalUser" pu ON pu."id" = uma."userId"
JOIN "PortalRole" pr ON pr."id" = pu."roleId" AND pr."name" <> 'Read Only'
WHERE NOT EXISTS (SELECT 1 FROM "UserModuleAccess" existing WHERE existing."moduleId" = target."id")
ON CONFLICT ("userId", "moduleId") DO NOTHING;
