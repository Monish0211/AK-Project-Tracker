-- Invoice Edit / Delete approval rights (Oct 2026).
--
-- Seed the two new ApprovalType lookup rows — idempotent, same upsert-by-name
-- convention as prisma/seed.ts's seedLookupTable() and the "Raise Invoice"
-- migration (20260929104241). Safe to re-run.
INSERT INTO "ApprovalType" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Edit Invoice', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Delete Invoice', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Preserve current access (confirmed business decision): before this
-- migration, PATCH/DELETE /invoice-lines/:id were allowed for exactly the
-- users holding "Invoices" module access whose role is not "Read Only"
-- (requireModuleAccess("Invoices") + denyReadOnlyWrites). Grant both new
-- rights to exactly that set so nobody silently loses an action they have
-- today; an Administrator can then remove them per user in Settings > User
-- Management. Users without Invoices access, and Read Only users, get nothing.
INSERT INTO "UserApprovalPermission" ("id", "userId", "approvalTypeId", "createdAt")
SELECT gen_random_uuid(), pu."id", at."id", CURRENT_TIMESTAMP
FROM "PortalUser" pu
JOIN "PortalRole" pr ON pr."id" = pu."roleId" AND pr."name" <> 'Read Only'
JOIN "UserModuleAccess" uma ON uma."userId" = pu."id"
JOIN "Module" m ON m."id" = uma."moduleId" AND m."name" = 'Invoices'
JOIN "ApprovalType" at ON at."name" IN ('Edit Invoice', 'Delete Invoice')
ON CONFLICT ("userId", "approvalTypeId") DO NOTHING;
