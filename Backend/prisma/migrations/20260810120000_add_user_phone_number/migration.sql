-- AlterTable
ALTER TABLE "PortalUser" ADD COLUMN "phoneNumber" TEXT;

-- Reconcile pre-existing drift: PortalRole.updatedAt had picked up a stray
-- DEFAULT CURRENT_TIMESTAMP outside of migration history (Prisma's
-- @updatedAt is enforced client-side on every write; this default was never
-- relied on and dropping it touches no existing data). Without this, every
-- future `prisma migrate dev` reports drift and offers to reset the database.
ALTER TABLE "PortalRole" ALTER COLUMN "updatedAt" DROP DEFAULT;
