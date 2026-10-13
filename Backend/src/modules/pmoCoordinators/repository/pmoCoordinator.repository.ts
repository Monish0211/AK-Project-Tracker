import { prisma } from "../../../shared/utils/prismaClient.js";
import type { CoordinatorAccountFacts } from "../services/pmoCoordinatorEligibility.rules.js";

export type PmoCoordinatorRow = Awaited<ReturnType<typeof prisma.pmoCoordinator.findUniqueOrThrow>>;

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type DbClient = typeof prisma | TxClient;

export function findAllPmoCoordinators(): Promise<PmoCoordinatorRow[]> {
  return prisma.pmoCoordinator.findMany({ orderBy: [{ displayName: "asc" }, { emailNormalized: "asc" }] });
}

export function findPmoCoordinatorById(id: string): Promise<PmoCoordinatorRow | null> {
  return prisma.pmoCoordinator.findUnique({ where: { id } });
}

export function findPmoCoordinatorByNormalizedEmail(emailNormalized: string): Promise<PmoCoordinatorRow | null> {
  return prisma.pmoCoordinator.findUnique({ where: { emailNormalized } });
}

export function createPmoCoordinator(data: {
  displayName: string;
  email: string;
  emailNormalized: string;
  createdByUserId: string;
}): Promise<PmoCoordinatorRow> {
  return prisma.pmoCoordinator.create({ data });
}

export type CoordinatorAccountRow = CoordinatorAccountFacts & { emailNormalized: string };

/**
 * Every PMO Portal account whose email, lower-cased and trimmed, equals one
 * of the given normalized emails. Raw SQL because PortalUser.email is stored
 * as entered (its unique index is case-sensitive) and Prisma's insensitive
 * filters cannot also trim. Read-only: never creates or changes an account.
 */
function selectAccountFacts(client: DbClient, emailsNormalized: string[]): Promise<CoordinatorAccountRow[]> {
  return client.$queryRaw<CoordinatorAccountRow[]>`
    SELECT u."id",
           u."fullName",
           u."isActive",
           u."accountLocked",
           lower(btrim(u."email")) AS "emailNormalized",
           EXISTS (
             SELECT 1 FROM "UserModuleAccess" uma
             JOIN "Module" m ON m."id" = uma."moduleId"
             WHERE uma."userId" = u."id" AND m."name" = 'Projects'
           ) AS "hasProjectsModule"
    FROM "PortalUser" u
    WHERE lower(btrim(u."email")) = ANY(${emailsNormalized}::text[])
    ORDER BY u."id"`;
}

export async function findAccountsByNormalizedEmails(emailsNormalized: string[]): Promise<CoordinatorAccountRow[]> {
  if (emailsNormalized.length === 0) return [];
  return selectAccountFacts(prisma, emailsNormalized);
}

/** Projects (archived included) whose assigned coordinator account is one of these ids, grouped per account. */
export async function countAssignedProjectsByAccount(accountIds: string[]): Promise<Map<string, number>> {
  if (accountIds.length === 0) return new Map();
  const groups = await prisma.project.groupBy({
    by: ["pmoCoordinatorUserId"],
    where: { pmoCoordinatorUserId: { in: accountIds } },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.pmoCoordinatorUserId as string, g._count._all]));
}

/**
 * Inside a project-save transaction: the registry entry, locked FOR SHARE
 * (so a concurrent removal or email edit, which take FOR UPDATE, waits until
 * this assignment commits and then sees it), plus its matching accounts.
 */
export async function findEntryWithAccountsForAssignment(
  tx: TxClient,
  entryId: string
): Promise<{ entry: { id: string; displayName: string; emailNormalized: string }; accounts: CoordinatorAccountRow[] } | null> {
  const rows = await tx.$queryRaw<{ id: string; displayName: string; emailNormalized: string }[]>`
    SELECT "id", "displayName", "emailNormalized" FROM "PmoCoordinator" WHERE "id" = ${entryId} FOR SHARE`;
  if (rows.length === 0) return null;
  return { entry: rows[0]!, accounts: await selectAccountFacts(tx, [rows[0]!.emailNormalized]) };
}

type AssignmentCounts = { activeProjects: number; archivedProjects: number };

/**
 * Locks the entry FOR UPDATE and counts projects (active and archived)
 * assigned to any account its CURRENT email resolves to. Returns null when
 * the entry does not exist. The lock is held until the caller's transaction
 * ends, so an assignment (FOR SHARE, above) cannot slip in between this
 * count and the caller's change.
 */
async function lockEntryAndCountAssignments(
  tx: TxClient,
  id: string
): Promise<(AssignmentCounts & { emailNormalized: string }) | null> {
  const locked = await tx.$queryRaw<{ emailNormalized: string }[]>`
    SELECT "emailNormalized" FROM "PmoCoordinator" WHERE "id" = ${id} FOR UPDATE`;
  if (locked.length === 0) return null;

  const counts = await tx.$queryRaw<{ archived: boolean; n: number }[]>`
    SELECT p."isDeleted" AS "archived", COUNT(*)::int AS "n"
    FROM "Project" p
    JOIN "PortalUser" u ON u."id" = p."pmoCoordinatorUserId"
    WHERE lower(btrim(u."email")) = ${locked[0]!.emailNormalized}
    GROUP BY p."isDeleted"`;
  return {
    emailNormalized: locked[0]!.emailNormalized,
    activeProjects: counts.find((c) => !c.archived)?.n ?? 0,
    archivedProjects: counts.find((c) => c.archived)?.n ?? 0,
  };
}

export type GuardedChangeOutcome<T> =
  | { kind: "not_found" }
  | ({ kind: "blocked" } & AssignmentCounts)
  | { kind: "done"; value: T };

/**
 * Removal with the agreed safety policy: blocked while ANY project
 * (archived included — a restored project would bring the coordinator's
 * access back) is assigned to an account this entry resolves to.
 */
export function removePmoCoordinatorIfUnassigned(id: string): Promise<GuardedChangeOutcome<null>> {
  return prisma.$transaction(async (tx) => {
    const state = await lockEntryAndCountAssignments(tx, id);
    if (!state) return { kind: "not_found" } as const;
    if (state.activeProjects + state.archivedProjects > 0) {
      return { kind: "blocked", activeProjects: state.activeProjects, archivedProjects: state.archivedProjects } as const;
    }
    await tx.pmoCoordinator.delete({ where: { id } });
    return { kind: "done", value: null } as const;
  });
}

/**
 * Email edit, same policy as removal: the email decides which account the
 * entry resolves to, so it may only change while no project (active or
 * archived) is assigned to the account it currently resolves to. A change
 * of letter case / spacing only (same normalized email) never re-points the
 * entry and is always allowed.
 */
export function updatePmoCoordinatorGuarded(
  id: string,
  data: { displayName?: string; email?: string; emailNormalized?: string }
): Promise<GuardedChangeOutcome<PmoCoordinatorRow>> {
  return prisma.$transaction(async (tx) => {
    const state = await lockEntryAndCountAssignments(tx, id);
    if (!state) return { kind: "not_found" } as const;
    const repoints = data.emailNormalized !== undefined && data.emailNormalized !== state.emailNormalized;
    if (repoints && state.activeProjects + state.archivedProjects > 0) {
      return { kind: "blocked", activeProjects: state.activeProjects, archivedProjects: state.archivedProjects } as const;
    }
    const updated = await tx.pmoCoordinator.update({ where: { id }, data });
    return { kind: "done", value: updated } as const;
  });
}

/** A short transaction for a standalone eligibility check (e.g. a PR Request draft save). */
export function runRegistryTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}
