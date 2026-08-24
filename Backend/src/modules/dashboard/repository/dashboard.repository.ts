import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { projectOwnershipWhereOr } from "../../../shared/utils/projectAccess.js";

export interface DashboardProjectRow {
  id: string;
  prNo: string;
  client: string;
  department: string;
  projectTitle: string;
  projectStatus: string;
  projectStartDate: Date;
  projectEndDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  manhourBudgetHours: number | null;
  primaryProjectManager: string | null;
}

export interface QuantityTotalsRow {
  projectId: string;
  woValue: number;
  woQty: number;
}

export interface InvoiceLineRow {
  id: string;
  status: string;
  invoiceAmountINR: number;
  invoiceDate: Date;
  invoiceNo: string;
  milestoneId: string | null;
  projectId: string;
  quantityItemId: string;
  quantityBilled: number;
}

/** Raw per-item rows needed to derive invoiceQty/pendingQty at the project level — see dashboard.service.ts. Kept separate from groupQuantityTotals() because the LUMP SUM pending-quantity ceiling (see shared/utils/quantityProgress.ts) must be applied per item before summing, not on an already-summed project total. */
export interface QuantityItemRow {
  id: string;
  projectId: string;
  woQty: number;
  uom: string;
}

export interface ResourceRow {
  projectId: string;
  employeeNo: string;
}

export interface EmployeeManagerRow {
  employeeNo: string;
  reportingManager: string | null;
}

export interface NoteRow {
  id: string;
  projectId: string;
  message: string;
  createdBy: string;
  createdAt: Date;
}

export interface MilestoneRow {
  id: string;
  projectId: string;
  paymentPercentage: number;
}

export function authorizedNonDeletedProjectWhere(callerUserId: string | undefined): Prisma.ProjectWhereInput {
  const ownershipOr = projectOwnershipWhereOr(callerUserId);
  if (!ownershipOr) {
    return { isDeleted: false };
  }
  return {
    isDeleted: false,
    AND: [{ OR: ownershipOr }],
  };
}

// P1-05 (production hardening) — a defensive fetch bound, not a claim that
// this many projects is expected. Re-audited: this query was already lean
// (12 projected columns, no `include`/nested relation, no N+1) — the real
// gap was only the total absence of any upper bound. `take` is CAP + 1 (not
// CAP) specifically so the caller can tell "exactly CAP rows happened to
// exist" apart from "there are MORE than CAP rows and this silently
// dropped some" — see getDashboardSummary()'s own overflow check, which
// throws an explicit error rather than ever computing Dashboard KPIs from a
// silently-incomplete project set.
export const DASHBOARD_PROJECT_FETCH_CAP = 50_000;

export function findAuthorizedProjects(callerUserId: string | undefined): Promise<DashboardProjectRow[]> {
  return prisma.project.findMany({
    where: authorizedNonDeletedProjectWhere(callerUserId),
    take: DASHBOARD_PROJECT_FETCH_CAP + 1,
    select: {
      id: true,
      prNo: true,
      client: true,
      department: true,
      projectTitle: true,
      projectStatus: true,
      projectStartDate: true,
      projectEndDate: true,
      createdAt: true,
      updatedAt: true,
      manhourBudgetHours: true,
      primaryProjectManager: true,
    },
  });
}

export async function groupQuantityTotals(projectIds: string[]): Promise<QuantityTotalsRow[]> {
  if (projectIds.length === 0) return [];
  const rows = await prisma.quantityItem.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds } },
    _sum: { woValue: true, woQty: true },
  });
  return rows.map((row) => ({
    projectId: row.projectId,
    woValue: row._sum.woValue ?? 0,
    woQty: row._sum.woQty ?? 0,
  }));
}

/** One query, every QuantityItem for these projects — see QuantityItemRow's own comment for why this stays separate from groupQuantityTotals(). */
export function findQuantityItemsForProjects(projectIds: string[]): Promise<QuantityItemRow[]> {
  if (projectIds.length === 0) return Promise.resolve([]);
  return prisma.quantityItem.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true, woQty: true, uom: true },
  });
}

// Dashboard bug fix (found during P2-13 stress testing) — this used to be
// `prisma.invoiceLine.findMany({ where: { quantityItem: { projectId: {...} } },
// select: { ..., quantityItem: { select: { projectId: true } } } })`, reading
// `row.quantityItem.projectId` on every result row. Confirmed by direct
// query-log inspection: this driver-adapter setup (@prisma/adapter-pg, no
// Rust query engine — relationLoadStrategy: "join" isn't available) always
// executes a nested to-one `select` as TWO separate SQL statements — first
// InvoiceLine, then a follow-up QuantityItem-by-id lookup — not one atomic
// JOIN. InvoiceLine.quantityItem is schema-guaranteed non-null at rest
// (onDelete: Restrict — Postgres itself refuses to delete a QuantityItem
// while any InvoiceLine still references it), so this was never a data
// problem: it's a read-consistency gap between those two round trips. If a
// concurrent DELETE /projects/:id/permanent (hardDeleteProject() — an
// atomic $transaction that deletes the project's InvoiceLines, then
// cascade-deletes its QuantityItems) commits in that gap, statement 1 can
// still return an InvoiceLine row that existed a moment ago, while
// statement 2's now-empty QuantityItem lookup makes Prisma fill in `null`
// for that row's nested relation — a genuine crash (TypeError reading
// `.projectId` of null), reproduced under concurrent test load.
//
// Fixed by anchoring the query on QuantityItem instead of InvoiceLine:
// projectId is QuantityItem's own direct scalar column (@@index([projectId])),
// never a separately-loaded relation, so it can never be null regardless of
// what the second (invoiceLines) query does. In the same race, the worst
// case is now a transiently-short invoiceLines array (Prisma's normal,
// always-safe default for "no rows found" on a to-many relation) — never a
// null dereference. Output shape (InvoiceLineRow[]) is unchanged.
export async function findInvoiceLinesForProjects(projectIds: string[]): Promise<InvoiceLineRow[]> {
  if (projectIds.length === 0) return [];
  const quantityItems = await prisma.quantityItem.findMany({
    where: { projectId: { in: projectIds } },
    select: {
      projectId: true,
      invoiceLines: {
        select: {
          id: true,
          status: true,
          invoiceAmountINR: true,
          invoiceDate: true,
          invoiceNo: true,
          milestoneId: true,
          quantityItemId: true,
          quantityBilled: true,
        },
      },
    },
  });
  return quantityItems.flatMap((item) =>
    item.invoiceLines.map((line) => ({
      id: line.id,
      status: line.status,
      invoiceAmountINR: line.invoiceAmountINR,
      invoiceDate: line.invoiceDate,
      invoiceNo: line.invoiceNo,
      milestoneId: line.milestoneId,
      quantityItemId: line.quantityItemId,
      quantityBilled: line.quantityBilled,
      projectId: item.projectId,
    }))
  );
}

export async function groupExpenseTotals(projectIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (projectIds.length === 0) return map;
  const rows = await prisma.projectExpense.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds } },
    _sum: { totalCost: true },
  });
  for (const row of rows) {
    map.set(row.projectId, row._sum.totalCost ?? 0);
  }
  return map;
}

export async function groupManhourCostTotals(projectIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (projectIds.length === 0) return map;
  const rows = await prisma.projectResource.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds } },
    _sum: { manhourCost: true },
  });
  for (const row of rows) {
    map.set(row.projectId, row._sum.manhourCost ?? 0);
  }
  return map;
}


export async function groupTimesheetHours(projectIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (projectIds.length === 0) return map;
  const rows = await prisma.timesheetEntry.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds } },
    _sum: { hours: true },
  });
  for (const row of rows) {
    if (row.projectId) {
      map.set(row.projectId, row._sum.hours ?? 0);
    }
  }
  return map;
}

export function findResourcesForProjects(projectIds: string[]): Promise<ResourceRow[]> {
  if (projectIds.length === 0) return Promise.resolve([]);
  return prisma.projectResource.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, employeeNo: true },
  });
}

export function findEmployeesByNos(employeeNos: string[]): Promise<EmployeeManagerRow[]> {
  if (employeeNos.length === 0) return Promise.resolve([]);
  return prisma.employee.findMany({
    where: { employeeNo: { in: employeeNos } },
    select: { employeeNo: true, reportingManager: true },
  });
}

export function findNotesForProjects(projectIds: string[]): Promise<NoteRow[]> {
  if (projectIds.length === 0) return Promise.resolve([]);
  return prisma.projectNote.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true, message: true, createdBy: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
}

export function findMilestonesForProjects(projectIds: string[]): Promise<MilestoneRow[]> {
  if (projectIds.length === 0) return Promise.resolve([]);
  return prisma.paymentMilestone.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true, paymentPercentage: true },
  });
}
