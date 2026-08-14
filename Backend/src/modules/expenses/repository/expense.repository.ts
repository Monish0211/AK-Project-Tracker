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

export function getExpensesByProjectId(projectId: string) {
  return prisma.projectExpense.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
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
