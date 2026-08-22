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
  invoiceQty: number;
  pendingQty: number;
}

export interface InvoiceLineRow {
  id: string;
  status: string;
  invoiceAmountINR: number;
  invoiceDate: Date;
  invoiceNo: string;
  milestoneId: string | null;
  projectId: string;
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

export function findAuthorizedProjects(callerUserId: string | undefined): Promise<DashboardProjectRow[]> {
  return prisma.project.findMany({
    where: authorizedNonDeletedProjectWhere(callerUserId),
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
    _sum: { woValue: true, woQty: true, invoiceQty: true, pendingQty: true },
  });
  return rows.map((row) => ({
    projectId: row.projectId,
    woValue: row._sum.woValue ?? 0,
    woQty: row._sum.woQty ?? 0,
    invoiceQty: row._sum.invoiceQty ?? 0,
    pendingQty: row._sum.pendingQty ?? 0,
  }));
}

export async function findInvoiceLinesForProjects(projectIds: string[]): Promise<InvoiceLineRow[]> {
  if (projectIds.length === 0) return [];
  const rows = await prisma.invoiceLine.findMany({
    where: { quantityItem: { projectId: { in: projectIds } } },
    select: {
      id: true,
      status: true,
      invoiceAmountINR: true,
      invoiceDate: true,
      invoiceNo: true,
      milestoneId: true,
      quantityItem: { select: { projectId: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    invoiceAmountINR: row.invoiceAmountINR,
    invoiceDate: row.invoiceDate,
    invoiceNo: row.invoiceNo,
    milestoneId: row.milestoneId,
    projectId: row.quantityItem.projectId,
  }));
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
