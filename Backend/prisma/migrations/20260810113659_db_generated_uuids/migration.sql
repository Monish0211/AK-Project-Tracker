-- Enable pgcrypto for gen_random_uuid().
-- PostgreSQL 13+ ships gen_random_uuid() as a built-in core function, so on
-- this database (PostgreSQL 18) it already works without this extension.
-- Enabled anyway for portability to any environment/version where it isn't
-- built in. IF NOT EXISTS makes this a no-op if it's already enabled.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- AlterTable
ALTER TABLE "ApprovalType" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "AuthAuditLog" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "Module" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "PasswordResetToken" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "PortalRole" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "PortalUser" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "Region" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "UserApprovalPermission" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "UserModuleAccess" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "UserRegionAccess" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
