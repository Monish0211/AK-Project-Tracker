import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { projectOwnershipWhereOr } from "../../../shared/utils/projectAccess.js";

/**
 * All Prisma access for Projects lives here — the service layer never
 * imports `prisma` directly. Every read filters isDeleted: false (soft
 * delete only, per the Project model's own doc comment), including the
 * duplicate-prNo check — a soft-deleted project's PR number is free to
 * reuse.
 */

export interface ProjectGeneralInfoData {
  poMonth: string;
  prCategory: string;
  prNo: string;
  rfqNo?: string | null;
  client: string;
  department: string;
  domesticForeign: string;
  projectTitle: string;
  workOrderStatus: string;
  projectStartDate: Date;
  projectEndDate?: Date | null;
  projectStatus: string;
  actualCompletionDate?: Date | null;
  completionRemarks?: string | null;
  completedBy?: string | null;
  completedTimestamp?: Date | null;
  workOrderNumber?: string | null;
  workOrderDate?: Date | null;
  eicName?: string | null;
  contactNumber?: string | null;
  emailId?: string | null;
  estimatedDuration?: number | null;
  durationUnit?: string | null;
  contractType: string;
  pmoCoordinator?: string | null;
  paymentType: string;
  gstApplicable: boolean;
  currency: string;
  currentExchangeRate: number;
  contractExchangeRate: number;

  // Expense Budget — Phase 3.5, flat on Project (see schema.prisma's own
  // note on this model for why it isn't a child table).
  manhourBudgetAmount?: number | null;
  manhourBudgetHours?: number | null;
  manhourBudgetRemarks?: string | null;
  nonManhourBudgetAmount?: number | null;
  nonManhourBudgetRemarks?: string | null;

  // Project Leadership — Phase 3.7. Flat on Project, same 1:1-attribute
  // treatment as Expense Budget above. pmoCoordinator already existed
  // (Phase 3.1) — not repeated here.
  primaryProjectManager?: string | null;
  secondaryProjectManager?: string | null;
  projectEngineer?: string | null;
  projectCoordinator?: string | null;
  clientCoordinator?: string | null;

  // Project Remarks — optional free-text timeline/delay explanation.
  remarks?: string | null;

  // Project-ownership authorization — see shared/utils/projectAccess.ts.
  // Set once at creation, from the authenticated caller's own JWT; never
  // accepted from the request body.
  createdByUserId?: string | null;

  // PMO Coordinator Management (Oct 2026) — the assigned coordinator ACCOUNT
  // and when it was assigned. Only ever set by project.service.ts from a
  // validated registry entry (never from free text, never by import).
  pmoCoordinatorUserId?: string | null;
  pmoCoordinatorAssignedAt?: Date | null;
}

type DbClient = typeof prisma | Prisma.TransactionClient;

/** For the coordinator-assignment save path, which must validate the registry entry and write the project atomically. */
export function runProjectTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}

/**
 * Inside a coordinator-assignment transaction: locks the project row
 * (FOR UPDATE) and returns its coordinator account as it stands NOW. Two
 * concurrent saves of the same assignment are serialized here, so only the
 * first one sees a change (and only it triggers the allocation email).
 */
export async function lockProjectCoordinatorForUpdate(tx: Prisma.TransactionClient, id: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ pmoCoordinatorUserId: string | null }[]>`
    SELECT "pmoCoordinatorUserId" FROM "Project" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0]?.pmoCoordinatorUserId ?? null;
}

export function createProject(data: ProjectGeneralInfoData, client: DbClient = prisma) {
  return client.project.create({ data });
}

export function findProjectById(id: string) {
  return prisma.project.findFirst({ where: { id, isDeleted: false } });
}

/**
 * Unlike findProjectById, does NOT filter by isDeleted — Permanent Delete
 * (see permanentlyDeleteProject() in project.service.ts) must be reachable
 * for both an active project and one that's already archived; an archived
 * project is exactly the expected starting point for this action.
 */
export function findProjectByIdAny(id: string) {
  return prisma.project.findUnique({ where: { id } });
}

export function findActiveProjectByPrNo(prNo: string) {
  return prisma.project.findFirst({ where: { prNo, isDeleted: false } });
}

/** Bulk-import duplicate check — one query for the whole batch instead of one per row. */
export function findActiveProjectsByPrNos(prNos: string[]) {
  return prisma.project.findMany({ where: { prNo: { in: prNos }, isDeleted: false } });
}

/**
 * Phase 3.8 — every project's id/prNo/isDeleted, WITHOUT the isDeleted
 * filter every other lookup above applies. The Timesheet reconciliation
 * engine (timesheets/services/timesheet.service.ts) builds an in-memory,
 * normalized PR-code lookup map from this once per import — it must
 * include archived projects (a historical Timesheet row for an archived
 * project is still processed, per the approved Phase 3.8 design; it must
 * never be treated as "not found" just because the project is no longer
 * active). Selecting only these 3 columns keeps this cheap even as the
 * Project table grows, since the Timesheet engine only ever needs the id
 * to resolve a match, never the full row.
 */
export function findAllProjectsForTimesheetMatching() {
  return prisma.project.findMany({ select: { id: true, prNo: true, isDeleted: true } });
}

/**
 * A single multi-row INSERT — atomic on its own (all rows land or none do),
 * so the Excel import path doesn't need a separate $transaction wrapper.
 */
export function createProjectsBulk(rows: ProjectGeneralInfoData[]) {
  return prisma.project.createManyAndReturn({ data: rows });
}

export function updateProject(id: string, data: Partial<ProjectGeneralInfoData>, client: DbClient = prisma) {
  return client.project.update({ where: { id }, data });
}

/** Archive — reversible. Sets isDeleted/deletedAt; the row and every child row (QuantityItem/PaymentMilestone/ProjectExpense) are left completely untouched. */
export function archiveProject(id: string) {
  return prisma.project.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

/** Recover — the exact inverse of archiveProject. Row and every child row are left completely untouched; only the archive markers are cleared. */
export function restoreProject(id: string) {
  return prisma.project.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

/**
 * Permanent Delete — irreversible. One atomic transaction:
 *  1. InvoiceLine rows under this project's QuantityItems are deleted
 *     explicitly first — InvoiceLine.quantityItemId is `onDelete: Restrict`,
 *     so Postgres would otherwise reject the QuantityItem cascade below the
 *     moment a non-deleted InvoiceLine still referenced it.
 *  2. The Project row itself is deleted — QuantityItem/PaymentMilestone/
 *     ProjectExpense/ProjectResource are removed automatically by Postgres
 *     via their `onDelete: Cascade` foreign keys (see schema.prisma).
 * TimesheetEntry rows are NEVER deleted here: TimesheetEntry.projectId is
 * `onDelete: SetNull`, so Postgres nulls the FK and leaves every entry
 * (plus TimesheetImport / TimesheetImportRowLog) intact for audit. Historical
 * PR identity survives on TimesheetEntry.rawProjectCode.
 * Both steps run in one $transaction — any failure rolls back everything.
 */
export function hardDeleteProject(id: string) {
  return prisma.$transaction([
    prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: id } } }),
    prisma.project.delete({ where: { id } }),
  ]);
}

export interface ProjectListFilters {
  search?: string | undefined;
  projectStatus?: string | undefined;
  department?: string | undefined;
  client?: string | undefined;
  prCategory?: string | undefined;
  /** Defaults to false (active-only) everywhere — pass true only for the Archived Projects list. */
  isDeleted?: boolean | undefined;
  /** Undefined ⇒ no ownership restriction (Administrator). Otherwise scopes results to this caller's own projects plus unclaimed legacy projects — see buildWhereClause. */
  callerUserId?: string | undefined;
}

async function buildWhereClause(filters: ProjectListFilters): Promise<Prisma.ProjectWhereInput> {
  const where: Prisma.ProjectWhereInput = { isDeleted: filters.isDeleted ?? false };

  if (filters.projectStatus) where.projectStatus = filters.projectStatus;
  if (filters.department) where.department = filters.department;
  if (filters.client) where.client = filters.client;
  if (filters.prCategory) where.prCategory = filters.prCategory;

  if (filters.search) {
    where.OR = [
      { prNo: { contains: filters.search, mode: "insensitive" } },
      { client: { contains: filters.search, mode: "insensitive" } },
      { projectTitle: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  // Project-ownership scoping — composed via a separate AND'd OR-group (not
  // the `where.OR` key above, already used for search) so the two
  // independent OR-conditions can never collide. Delegates to the shared
  // projectAccess.ts primitive (same one Dashboard/Timesheets/Resources use)
  // rather than reimplementing the OR shape here a second time — a null
  // createdByUserId (every project that existed before ownership was
  // introduced) is always visible; otherwise the caller's own projects,
  // plus any Project Manager Scope grants they hold, are.
  const ownershipOr = await projectOwnershipWhereOr(filters.callerUserId);
  if (ownershipOr) {
    where.AND = [{ OR: ownershipOr }];
  }

  return where;
}

export async function findProjectsPage(
  filters: ProjectListFilters,
  sortField: string,
  sortDirection: "asc" | "desc",
  page: number,
  pageSize: number
) {
  const where = await buildWhereClause(filters);

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { [sortField]: sortDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  return { items, total };
}

/** The exact statuses the Sidebar's "Quick Summary" card shows — kept as a
 * plain literal tuple here (not imported from anywhere) since it must match
 * Sidebar.tsx's own hardcoded SUMMARY_ROWS list exactly; this is a UI-display
 * count, not the broader ACTIVE_PROJECT_STATUSES business classification. */
const SIDEBAR_STATUS_COUNT_KEYS = ["Active", "On Hold", "Completed", "Cancelled"] as const;
export type SidebarStatusCounts = Record<(typeof SIDEBAR_STATUS_COUNT_KEYS)[number], number>;

/**
 * Sidebar "Quick Summary" counts (Active/On Hold/Completed/Cancelled) via a
 * single grouped query, replacing what used to be 4 separate
 * findProjectsPage(pageSize: 1) calls (one per status) from the frontend.
 * Same `buildWhereClause()` this file already uses for every other project
 * read — including the exact same `isDeleted: false` default and ownership
 * (`callerUserId`) scoping — so authorization/visibility is identical to
 * calling findProjectsPage() once per status; only the query shape changed
 * (one groupBy instead of 4x findMany+count), never who is allowed to see
 * what. Each returned count is an exact `projectStatus` string match, same
 * as before — this does not use/introduce ACTIVE_PROJECT_STATUSES.
 */
export async function countProjectsByStatus(callerUserId: string | undefined): Promise<SidebarStatusCounts> {
  const where = await buildWhereClause({ callerUserId });

  const rows = await prisma.project.groupBy({
    by: ["projectStatus"],
    where,
    _count: true,
  });

  const counts: SidebarStatusCounts = { Active: 0, "On Hold": 0, Completed: 0, Cancelled: 0 };
  for (const row of rows) {
    if ((SIDEBAR_STATUS_COUNT_KEYS as readonly string[]).includes(row.projectStatus)) {
      counts[row.projectStatus as (typeof SIDEBAR_STATUS_COUNT_KEYS)[number]] = row._count;
    }
  }
  return counts;
}
