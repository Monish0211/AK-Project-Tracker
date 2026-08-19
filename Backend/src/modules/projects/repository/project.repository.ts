import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";

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
}

export function createProject(data: ProjectGeneralInfoData) {
  return prisma.project.create({ data });
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

export function updateProject(id: string, data: Partial<ProjectGeneralInfoData>) {
  return prisma.project.update({ where: { id }, data });
}

/** Archive — reversible. Sets isDeleted/deletedAt; the row and every child row (QuantityItem/PaymentMilestone/ProjectExpense) are left completely untouched. */
export function archiveProject(id: string) {
  return prisma.project.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

/**
 * Permanent Delete — irreversible. A real row delete; QuantityItem/
 * PaymentMilestone/ProjectExpense are removed automatically by Postgres via
 * their `onDelete: Cascade` foreign keys (see schema.prisma) — never deleted
 * manually here or anywhere in the service layer above this function.
 */
export function hardDeleteProject(id: string) {
  return prisma.project.delete({ where: { id } });
}

export interface ProjectListFilters {
  search?: string | undefined;
  projectStatus?: string | undefined;
  department?: string | undefined;
  client?: string | undefined;
  prCategory?: string | undefined;
}

function buildWhereClause(filters: ProjectListFilters): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = { isDeleted: false };

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

  return where;
}

export async function findProjectsPage(
  filters: ProjectListFilters,
  sortField: string,
  sortDirection: "asc" | "desc",
  page: number,
  pageSize: number
) {
  const where = buildWhereClause(filters);

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
