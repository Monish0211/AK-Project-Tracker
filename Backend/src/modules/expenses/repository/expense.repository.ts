import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import type { ProjectExpenseData } from "../expense.types.js";

/**
 * All Prisma access for Other Project Expenses lives here — the service
 * layer never imports `prisma` directly (same rule as
 * quantity.repository.ts). No business logic — totalCost arrives already
 * computed by expense.service.ts.
 */

export function createExpense(projectId: string, data: ProjectExpenseData) {
  return prisma.projectExpense.create({ data: { ...data, projectId } });
}

// Excel Import (Sept 2026) — isActive: true excludes superseded imported
// versions (see ExpenseImportBatch's own schema comment) from every list/
// total. Every existing row (manual or otherwise) already defaults to
// isActive: true, so this is a no-op for all current data.
export function getExpensesByProjectId(projectId: string) {
  return prisma.projectExpense.findMany({
    where: { projectId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

// Reports data consistency (Oct 2026) — one page of active expense rows
// across every project matching `projectWhere` (the caller's authorized
// projects, built by projectAccess.ts's authorizedProjectReadWhere()).
// Deterministic order so offset pages never skip or repeat a row.
export function getActiveExpensesForProjectsPage(projectWhere: Prisma.ProjectWhereInput, skip: number, take: number) {
  return prisma.projectExpense.findMany({
    where: { isActive: true, project: projectWhere },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip,
    take,
  });
}

export function countActiveExpensesForProjects(projectWhere: Prisma.ProjectWhereInput) {
  return prisma.projectExpense.count({ where: { isActive: true, project: projectWhere } });
}

export function getExpenseById(id: string) {
  return prisma.projectExpense.findUnique({ where: { id } });
}

export function updateExpense(id: string, data: Partial<ProjectExpenseData>) {
  return prisma.projectExpense.update({ where: { id }, data });
}

export function deleteExpense(id: string) {
  return prisma.projectExpense.delete({ where: { id } });
}

/** Not wired to a route yet — kept for a future project-delete cascade helper, mirroring the schema's onDelete: Cascade at the DB level (same convention as quantity.repository.ts's own unused deleteAllByProject). */
export function deleteAllByProject(projectId: string) {
  return prisma.projectExpense.deleteMany({ where: { projectId } });
}
