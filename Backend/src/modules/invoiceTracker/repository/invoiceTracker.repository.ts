import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { RAISED_STATUSES, type MonthWindow } from "../invoiceTracker.rules.js";

/**
 * Invoice Tracker (Oct 2026) — read-only queries. Nothing here writes. Project visibility is always passed in as a
 * `where` built by authorizedProjectReadWhere() (the rule every cross-project list already uses).
 */

export const PROJECT_LIST_SELECT = { id: true, prNo: true, client: true, projectTitle: true, projectStatus: true } as const;

export function countProjects(where: Prisma.ProjectWhereInput) {
  return prisma.project.count({ where });
}

/** One page, stable order: PR number, then id as the tie-break. */
export function findProjectsPage(where: Prisma.ProjectWhereInput, skip: number, take: number) {
  return prisma.project.findMany({ where, select: PROJECT_LIST_SELECT, orderBy: [{ prNo: "asc" }, { id: "asc" }], skip, take });
}

/** Projects with at least one qualifying (Raised / PartiallyPaid / Paid) invoice line dated in the month. */
export function raisedInMonthWhere(window: MonthWindow): Prisma.ProjectWhereInput {
  return { quantityItems: { some: { invoiceLines: { some: { invoiceDate: { gte: window.start, lt: window.end }, status: { in: [...RAISED_STATUSES] } } } } } };
}

export const OPEN_REQUEST_WHERE: Prisma.ProjectWhereInput = { invoiceRequests: { some: { status: "Open" } } };

/** Every invoice line dated in the month across the matching projects — one query, only the fields the totals need. */
export async function findMonthLines(projectWhere: Prisma.ProjectWhereInput, window: MonthWindow) {
  const rows = await prisma.invoiceLine.findMany({
    where: { invoiceDate: { gte: window.start, lt: window.end }, quantityItem: { project: projectWhere } },
    select: { id: true, invoiceNo: true, status: true, invoiceAmountINR: true, quantityItem: { select: { projectId: true } } },
  });
  return rows.map((r) => ({ id: r.id, projectId: r.quantityItem.projectId, invoiceNo: r.invoiceNo, status: r.status, invoiceAmountINR: r.invoiceAmountINR }));
}

/** Every invoice line of one project, all dates, with everything the expanded chain shows (newest first). */
export function findProjectLines(projectId: string) {
  return prisma.invoiceLine.findMany({
    where: { quantityItem: { projectId } },
    select: {
      id: true, invoiceNo: true, invoiceDate: true, status: true, invoiceAmountINR: true, currency: true, invoiceAmountOriginal: true,
      createdAt: true, createdBy: true, quantityItemId: true, quantityItem: { select: { description: true } },
    },
    orderBy: [{ invoiceDate: "desc" }, { invoiceNo: "asc" }, { createdAt: "asc" }, { id: "asc" }],
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
