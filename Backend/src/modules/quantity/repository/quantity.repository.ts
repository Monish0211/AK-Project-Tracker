import { prisma } from "../../../shared/utils/prismaClient.js";
import type { QuantityItemData } from "../quantity.types.js";

/**
 * All Prisma access for Quantity lives here — the service layer never
 * imports `prisma` directly (same rule as project.repository.ts). No
 * business logic, no calculations — pendingQty/unitRateINR/woValue/
 * pendingAmount arrive already computed by quantity.service.ts.
 */

export function createQuantity(projectId: string, data: QuantityItemData) {
  return prisma.quantityItem.create({ data: { ...data, projectId } });
}

export function getQuantityByProjectId(projectId: string) {
  return prisma.quantityItem.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

export function getQuantityById(id: string) {
  return prisma.quantityItem.findUnique({ where: { id } });
}

export function updateQuantity(id: string, data: Partial<QuantityItemData>) {
  return prisma.quantityItem.update({ where: { id }, data });
}

export function deleteQuantity(id: string) {
  return prisma.quantityItem.delete({ where: { id } });
}

/** Not wired to a route yet — kept for a future project-delete cascade helper, mirroring the schema's onDelete: Cascade at the DB level. */
export function deleteAllByProject(projectId: string) {
  return prisma.quantityItem.deleteMany({ where: { projectId } });
}
