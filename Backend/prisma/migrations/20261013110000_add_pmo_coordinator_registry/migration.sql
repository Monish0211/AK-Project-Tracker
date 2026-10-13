-- PMO Coordinator Management (Oct 2026).
--
-- 1. PmoCoordinator: the Settings-managed registry of approved PMO
--    Coordinators, keyed by email (emailNormalized = lower(btrim(email))).
--    No FK to PortalUser: an entry may exist before its login account does;
--    the account is resolved live by case-insensitive email at read time.
-- 2. Project.pmoCoordinatorUserId: the ACCOUNT assigned as the project's PMO
--    Coordinator (FK -> PortalUser, ON DELETE SET NULL), plus
--    pmoCoordinatorAssignedAt. Both start NULL for every existing project —
--    no backfill from the free-text "pmoCoordinator" column here (a backfill
--    needs separate approval). Existing access is therefore unchanged.
--
-- Additive only (one new table, two nullable columns, one index, two FKs);
-- independent of the notification-recipient migration's "pmoCoordinatorId".

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "pmoCoordinatorAssignedAt" TIMESTAMP(3),
ADD COLUMN     "pmoCoordinatorUserId" TEXT;

-- CreateTable
CREATE TABLE "PmoCoordinator" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmoCoordinator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PmoCoordinator_emailNormalized_key" ON "PmoCoordinator"("emailNormalized");

-- CreateIndex
CREATE INDEX "Project_pmoCoordinatorUserId_idx" ON "Project"("pmoCoordinatorUserId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_pmoCoordinatorUserId_fkey" FOREIGN KEY ("pmoCoordinatorUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmoCoordinator" ADD CONSTRAINT "PmoCoordinator_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: the approved list (Oct 2026), names and emails EXACTLY as supplied
-- (not corrected). createdByUserId stays NULL (seeded by migration).
-- Idempotent: an entry whose normalized email already exists is skipped.
INSERT INTO "PmoCoordinator" ("displayName", "email", "emailNormalized", "updatedAt")
SELECT v."displayName", v."email", lower(btrim(v."email")), CURRENT_TIMESTAMP
FROM (VALUES
    ('Sivagnanam S',    'sivagnanam@ifluids.com'),
    ('Ashwini C',       'ashvini.c@ifluids.com'),
    ('Monish N',        'monish.n@ifluids.com'),
    ('Naveen Kumar R',  'naveen.kumar@ifluids.com'),
    ('Bhupesh Nizhare', 'bhupesh.nizhare@ifluids.com'),
    ('Khushbu P',       'khushbu.p@elixirengineering.com'),
    ('Manoj Kumar G',   'Manojkumar.g@ifluids.com'),
    ('Saravana S',      'saravanan@ifluids.com'),
    ('Ayush Singh',     'ayush.singh@ifluids.com'),
    ('Jayabalini S',    'jayabalini.s@ifluids.com'),
    ('SolaimalaI',      'solaimalai@ifluids.com')
) AS v("displayName", "email")
ON CONFLICT ("emailNormalized") DO NOTHING;
