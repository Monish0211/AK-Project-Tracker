import { Prisma } from "../../../../generated/prisma/client.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { MISSING_EXPENSE_JOB_NAME } from "../missingExpense.rules.js";
import { UNPAID_INVOICE_JOB_NAME } from "../unpaidInvoice.rules.js";
import { totalPagesFor, type PageRequest } from "../weeklyPaging.js";

/**
 * Weekly email report exclusions (Nov 2026).
 *
 * An Administrator can take a project out of ONE weekly report ("Projects Missing Other Project Expenses" or "Invoices
 * Unpaid for 30+ Days") until an Administrator restores it. Report-level only: the WeeklyReportExclusion table is the
 * single thing written; no project, invoice, expense or payment row is ever changed.
 *
 * Both reports drop excluded projects in their buildReport() - the one function behind the Settings preview, the paged
 * preview AND the scheduled / manual send - so what the preview shows is exactly what the weekly email would contain.
 *
 * Authorization: every exclusion action and the Excluded History are for Administrators only. The routes check the token
 * role; this service re-reads the caller from the database on every call (active + role Administrator), so a deactivated
 * or demoted user is refused on the very next request. No new permission is introduced.
 */

export const REPORT_TYPES = [MISSING_EXPENSE_JOB_NAME, UNPAID_INVOICE_JOB_NAME] as const;
export type WeeklyReportType = (typeof REPORT_TYPES)[number];

export const REPORT_NAMES: Record<WeeklyReportType, string> = {
  [MISSING_EXPENSE_JOB_NAME]: "Projects Missing Other Project Expenses",
  [UNPAID_INVOICE_JOB_NAME]: "Invoices Unpaid for 30+ Days",
};

export const AUDIT_EXCLUDED = "WEEKLY_REPORT_PROJECT_EXCLUDED";
export const AUDIT_RESTORED = "WEEKLY_REPORT_PROJECT_RESTORED";

export function isReportType(value: string): value is WeeklyReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}

// ── Report filtering ────────────────────────────────────────────────────────

/** Project ids with an ACTIVE exclusion from this report (served by the partial unique index). */
export async function activeExcludedProjectIds(reportType: WeeklyReportType): Promise<Set<string>> {
  const rows = await prisma.weeklyReportExclusion.findMany({ where: { reportType, restoredAt: null }, select: { projectId: true } });
  return new Set(rows.map((r) => r.projectId));
}

/** Drops every item whose project is excluded from this report. */
export async function withoutExcluded<T>(reportType: WeeklyReportType, items: T[], projectIdOf: (item: T) => string): Promise<T[]> {
  const excluded = await activeExcludedProjectIds(reportType);
  return excluded.size === 0 ? items : items.filter((item) => !excluded.has(projectIdOf(item)));
}

// ── Authorization ───────────────────────────────────────────────────────────

interface Actor {
  id: string;
  email: string;
  fullName: string;
}

/** The caller, re-read from the database, when they are an ACTIVE Administrator right now; otherwise null. */
async function currentAdministrator(userId: string): Promise<Actor | null> {
  const user = await prisma.portalUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, isActive: true, role: { select: { name: true } } },
  });
  if (!user || !user.isActive || user.role.name !== "Administrator") return null;
  return { id: user.id, email: user.email, fullName: user.fullName };
}

/** Whether the caller may exclude / restore / see Excluded History (used by the previews to show the controls). */
export async function canManageExclusions(userId: string): Promise<boolean> {
  return (await currentAdministrator(userId)) !== null;
}

async function requireAdministrator(userId: string): Promise<Actor> {
  const actor = await currentAdministrator(userId);
  if (!actor) throw new AppError("Only an Administrator can exclude projects from weekly email reports or view the Excluded History.", 403);
  return actor;
}

// ── Exclude / restore ───────────────────────────────────────────────────────

export interface ExclusionView {
  id: string;
  projectId: string;
  reportType: WeeklyReportType;
  reportName: string;
  prNo: string;
  projectTitle: string;
  client: string;
  excludedBy: string;
  excludedAt: string;
  status: "Active" | "Restored";
  restoredBy: string | null;
  restoredAt: string | null;
}

type ExclusionRow = Prisma.WeeklyReportExclusionGetPayload<object>;

function view(row: ExclusionRow): ExclusionView {
  const reportType = row.reportType as WeeklyReportType;
  return {
    id: row.id,
    projectId: row.projectId,
    reportType,
    reportName: REPORT_NAMES[reportType] ?? row.reportType,
    prNo: row.prNo,
    projectTitle: row.projectTitle,
    client: row.client,
    excludedBy: row.excludedByName,
    excludedAt: row.excludedAt.toISOString(),
    status: row.restoredAt ? "Restored" : "Active",
    restoredBy: row.restoredByName,
    restoredAt: row.restoredAt ? row.restoredAt.toISOString() : null,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return true;
  // Driver-adapter errors can surface the raw PostgreSQL code.
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { meta?: unknown }).meta ?? {})}` : "";
  return text.includes("23505") || text.includes("WeeklyReportExclusion_active_key");
}

const alreadyExcluded = (reportType: WeeklyReportType) =>
  new AppError(`This project is already excluded from the "${REPORT_NAMES[reportType]}" report.`, 409);

/**
 * Takes a project out of one report until restored. 409 when it is already excluded from that report (also enforced by
 * the partial unique index, so two simultaneous clicks cannot both succeed). Writes the exclusion and its audit entry in
 * one transaction.
 */
export async function excludeProject(userId: string, input: { reportType: WeeklyReportType; projectId: string }): Promise<ExclusionView> {
  const actor = await requireAdministrator(userId);
  const { reportType, projectId } = input;
  const project = await prisma.project.findFirst({
    where: { id: projectId, isDeleted: false },
    select: { id: true, prNo: true, projectTitle: true, client: true },
  });
  if (!project) throw new AppError("Project not found.", 404);
  const existing = await prisma.weeklyReportExclusion.findFirst({ where: { projectId, reportType, restoredAt: null }, select: { id: true } });
  if (existing) throw alreadyExcluded(reportType);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.weeklyReportExclusion.create({
        data: {
          projectId,
          reportType,
          prNo: project.prNo,
          projectTitle: project.projectTitle,
          client: project.client,
          excludedByUserId: actor.id,
          excludedByName: actor.fullName,
          excludedAt: new Date(),
        },
      });
      await tx.authAuditLog.create({
        data: {
          userId: actor.id,
          email: actor.email,
          event: AUDIT_EXCLUDED,
          details: { exclusionId: created.id, reportType, reportName: REPORT_NAMES[reportType], projectId, prNo: project.prNo, at: created.excludedAt.toISOString() },
        },
      });
      return created;
    });
    console.log(`[WeeklyReportExclusion] ${actor.email} excluded project ${project.prNo} from ${reportType}.`);
    return view(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw alreadyExcluded(reportType);
    throw err;
  }
}

/** Puts an excluded project back into its report (the row is kept as history). 404 unknown id, 409 already restored. */
export async function restoreExclusion(userId: string, exclusionId: string): Promise<ExclusionView> {
  const actor = await requireAdministrator(userId);
  const row = await prisma.$transaction(async (tx) => {
    const current = await tx.weeklyReportExclusion.findUnique({ where: { id: exclusionId } });
    if (!current) throw new AppError("Exclusion not found.", 404);
    // Conditional update: only an ACTIVE row is restored, so two restores of the same row cannot both succeed.
    const { count } = await tx.weeklyReportExclusion.updateMany({
      where: { id: exclusionId, restoredAt: null },
      data: { restoredAt: new Date(), restoredByUserId: actor.id, restoredByName: actor.fullName },
    });
    if (count === 0) throw new AppError("This exclusion has already been restored.", 409);
    const updated = await tx.weeklyReportExclusion.findUniqueOrThrow({ where: { id: exclusionId } });
    await tx.authAuditLog.create({
      data: {
        userId: actor.id,
        email: actor.email,
        event: AUDIT_RESTORED,
        details: {
          exclusionId,
          reportType: current.reportType,
          reportName: REPORT_NAMES[current.reportType as WeeklyReportType] ?? current.reportType,
          projectId: current.projectId,
          prNo: current.prNo,
          excludedAt: current.excludedAt.toISOString(),
          at: updated.restoredAt!.toISOString(),
        },
      },
    });
    return updated;
  });
  console.log(`[WeeklyReportExclusion] ${actor.email} restored project ${row.prNo} to ${row.reportType}.`);
  return view(row);
}

// ── Excluded History ────────────────────────────────────────────────────────

export type ExclusionStatusFilter = "active" | "restored" | "all";

/**
 * Excluded History for one report: active exclusions first (newest first), then restored ones (most recently restored
 * first). Includes the active / restored counts of both reports for the tabs.
 */
export async function listExclusions(userId: string, query: PageRequest & { reportType: WeeklyReportType; status: ExclusionStatusFilter }) {
  await requireAdministrator(userId);
  const where: Prisma.WeeklyReportExclusionWhereInput = {
    reportType: query.reportType,
    ...(query.status === "active" ? { restoredAt: null } : query.status === "restored" ? { restoredAt: { not: null } } : {}),
  };
  const [total, rows, activeCounts, restoredCounts] = await Promise.all([
    prisma.weeklyReportExclusion.count({ where }),
    prisma.weeklyReportExclusion.findMany({
      where,
      orderBy: [{ restoredAt: { sort: "desc", nulls: "first" } }, { excludedAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.weeklyReportExclusion.groupBy({ by: ["reportType"], _count: { _all: true }, where: { restoredAt: null } }),
    prisma.weeklyReportExclusion.groupBy({ by: ["reportType"], _count: { _all: true }, where: { restoredAt: { not: null } } }),
  ]);
  const counts = Object.fromEntries(REPORT_TYPES.map((t) => [t, { active: 0, restored: 0 }])) as Record<WeeklyReportType, { active: number; restored: number }>;
  for (const g of activeCounts) if (isReportType(g.reportType)) counts[g.reportType].active = g._count._all;
  for (const g of restoredCounts) if (isReportType(g.reportType)) counts[g.reportType].restored = g._count._all;
  return {
    reportType: query.reportType,
    reportName: REPORT_NAMES[query.reportType],
    status: query.status,
    items: rows.map(view),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: totalPagesFor(total, query.pageSize),
    counts,
  };
}
