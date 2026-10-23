import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { OUTSTANDING_STORED_STATUSES, type MonthWindow, type RequestLite, type TrackerLine } from "../invoiceTracker.rules.js";

/**
 * Invoice Tracker — read-only queries. Nothing here writes. Project visibility is always passed in as a `where` built by
 * authorizedProjectReadWhere() (the rule every cross-project list already uses) and applied to every query.
 */

export const PROJECT_LIST_SELECT = { id: true, prNo: true, client: true, projectTitle: true, projectStatus: true } as const;

/** One page, stable order: PR number, then id as the tie-break. */
export function findProjectsPage(where: Prisma.ProjectWhereInput, skip: number, take: number) {
  return prisma.project.findMany({ where, select: PROJECT_LIST_SELECT, orderBy: [{ prNo: "asc" }, { id: "asc" }], skip, take });
}

export function findProjectsByIds(base: Prisma.ProjectWhereInput, ids: string[]) {
  if (ids.length === 0) return Promise.resolve([]);
  return prisma.project.findMany({ where: { AND: [base, { id: { in: ids } }] }, select: PROJECT_LIST_SELECT });
}

const createdIn = (window: MonthWindow | null): Prisma.DateTimeFilter | undefined => (window ? { gte: window.start, lt: window.end } : undefined);

/**
 * Projects (inside `base`) that have at least one invoice line DATED in the month — the candidates for the month report. The
 * invoice date is a date-only value at UTC midnight, so the window is the UTC calendar month: [1st, next 1st).
 */
export async function findProjectIdsWithInvoiceDateIn(base: Prisma.ProjectWhereInput, window: MonthWindow): Promise<string[]> {
  const rows = await prisma.invoiceLine.findMany({
    where: { invoiceDate: { gte: window.dateStart, lt: window.dateEnd }, quantityItem: { project: base } },
    select: { quantityItem: { select: { projectId: true } } },
  });
  return [...new Set(rows.map((r) => r.quantityItem.projectId))];
}

/** Projects (inside `base`) that have a line that may still be owed (Raised / legacy Submitted / PartiallyPaid). */
export async function findProjectIdsWithOutstandingLines(base: Prisma.ProjectWhereInput): Promise<string[]> {
  const rows = await prisma.invoiceLine.findMany({
    where: { status: { in: [...OUTSTANDING_STORED_STATUSES] }, quantityItem: { project: base } },
    select: { quantityItem: { select: { projectId: true } } },
  });
  return [...new Set(rows.map((r) => r.quantityItem.projectId))];
}

type LineRow = {
  id: string;
  invoiceNo: string;
  invoiceDate: Date;
  status: string;
  invoiceAmountINR: number;
  createdAt: Date;
  quantityItemId: string;
  quantityItem: { projectId: string };
};

const toTrackerLine = (r: LineRow): TrackerLine => ({
  id: r.id,
  projectId: r.quantityItem.projectId,
  quantityItemId: r.quantityItemId,
  invoiceNo: r.invoiceNo,
  invoiceDate: r.invoiceDate,
  status: r.status,
  invoiceAmountINR: r.invoiceAmountINR,
  createdAt: r.createdAt,
});

const LIGHT_LINE_SELECT = { id: true, invoiceNo: true, invoiceDate: true, status: true, invoiceAmountINR: true, createdAt: true, quantityItemId: true, quantityItem: { select: { projectId: true } } } as const;

/** EVERY line of the given projects, only the fields grouping needs — an invoice's creation date needs all its lines, any month. */
export async function findLinesForProjects(projectIds: string[]): Promise<TrackerLine[]> {
  if (projectIds.length === 0) return [];
  const rows = await prisma.invoiceLine.findMany({ where: { quantityItem: { projectId: { in: projectIds } } }, select: LIGHT_LINE_SELECT });
  return rows.map(toTrackerLine);
}

/** Every line of every project inside `base` (the all-months history). */
export async function findLinesInScope(base: Prisma.ProjectWhereInput): Promise<TrackerLine[]> {
  const rows = await prisma.invoiceLine.findMany({ where: { quantityItem: { project: base } }, select: LIGHT_LINE_SELECT });
  return rows.map(toTrackerLine);
}

/** Invoice requests inside `base`, created in the window (null = all). Light fields only. */
export async function findRequests(base: Prisma.ProjectWhereInput, window: MonthWindow | null): Promise<RequestLite[]> {
  return prisma.invoiceRequest.findMany({
    where: { project: base, ...(window ? { createdAt: createdIn(window)! } : {}) },
    select: { id: true, projectId: true, status: true, createdAt: true },
  });
}

const RAISED_STORED = ["Raised", "Submitted", "PartiallyPaid", "Paid"];

/**
 * The first RECORDED raise of each line: the earliest status event that moved it into a raised state (Raised, legacy Submitted,
 * Partially Paid, Paid) from a state that was not raised (or from nothing, on creation). Lines without such an event — created
 * before history tracking, or only ever paid since — are absent from the result; no time is invented for them.
 */
export async function findFirstRaiseTimes(lineIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (lineIds.length === 0) return out;
  const rows = await prisma.invoiceStatusEvent.groupBy({
    by: ["invoiceLineId"],
    where: {
      invoiceLineId: { in: lineIds },
      toStatus: { in: RAISED_STORED },
      OR: [{ fromStatus: null }, { fromStatus: { notIn: RAISED_STORED } }],
    },
    _min: { occurredAt: true },
  });
  for (const r of rows) if (r._min.occurredAt) out.set(r.invoiceLineId, r._min.occurredAt);
  return out;
}

/** One project's lines with everything the expanded records show (all months; the caller filters by creation month). */
export function findProjectLinesDetailed(projectId: string) {
  return prisma.invoiceLine.findMany({
    where: { quantityItem: { projectId } },
    select: {
      id: true, invoiceNo: true, invoiceDate: true, status: true, invoiceAmountINR: true, currency: true, invoiceAmountOriginal: true,
      createdAt: true, createdBy: true, quantityItemId: true, quantityItem: { select: { description: true, projectId: true } },
    },
    orderBy: [{ createdAt: "asc" }, { invoiceNo: "asc" }, { id: "asc" }],
  });
}

/**
 * ALL invoice requests of the given projects (any date, any status) — ONE query for however many projects, only the fields the project
 * row's latest record needs. The row needs requests of every date: the latest record is "up to the end of the month", not "created in it".
 */
export function findRequestsForProjects(projectIds: string[]) {
  if (projectIds.length === 0) return Promise.resolve([]);
  return prisma.invoiceRequest.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true, status: true, createdAt: true, fulfilledInvoiceLineId: true },
  });
}

/** One project's invoice requests with who / what, created in the window (null = all). */
export function findProjectRequestsDetailed(projectId: string, window: MonthWindow | null) {
  return prisma.invoiceRequest.findMany({
    where: { projectId, ...(window ? { createdAt: createdIn(window)! } : {}) },
    select: {
      id: true, status: true, createdAt: true, updatedAt: true, invoiceAmountNote: true, notes: true,
      requestedBy: { select: { fullName: true } },
      assignedTo: { select: { fullName: true } },
      fulfilledInvoiceLineId: true,
      fulfilledInvoiceLine: { select: { invoiceNo: true, invoiceDate: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
}

/** Invoice requests that were fulfilled by one of these lines — the only reliable request → invoice link there is. */
export async function findRequestsFulfilledBy(invoiceLineIds: string[]) {
  if (invoiceLineIds.length === 0) return [];
  return prisma.invoiceRequest.findMany({
    where: { fulfilledInvoiceLineId: { in: invoiceLineIds } },
    select: { id: true, createdAt: true, fulfilledInvoiceLineId: true, requestedBy: { select: { fullName: true } } },
  });
}

export function findProjectSummary(projectId: string) {
  return prisma.project.findUnique({ where: { id: projectId }, select: PROJECT_LIST_SELECT });
}
