-- "View All Projects" approval right (Oct 2026).
--
-- PMO-Manager-equivalent project access (view AND edit every project) for a
-- user an Administrator grants it to (e.g. Accounts), enforced in
-- shared/utils/projectAccess.ts (canAccessProject / resolveProjectReadScope).
-- Does NOT grant archive, permanent delete, invoice raise/edit/delete or any
-- other approval right, and never bypasses module access or Read Only.
--
-- Seed the ApprovalType lookup row only — idempotent, same upsert-by-name
-- convention as prisma/seed.ts and the earlier approval-type migrations.
-- Deliberately grants it to NOBODY: Administrator and PMO Manager already see
-- every project by role, and every other user (Accounts included) must be
-- granted it explicitly per user in Settings > User Management. No
-- UserApprovalPermission row = disabled.
INSERT INTO "ApprovalType" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'View All Projects', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
