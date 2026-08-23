import { prisma } from "../../../shared/utils/prismaClient.js";
import type { QuantityItemData } from "../quantity.types.js";

/**
 * All Prisma access for Quantity lives here — the service layer never
 * imports `prisma` directly (same rule as project.repository.ts). No
 * business logic, no calculations — unitRateINR/woValue arrive already
 * computed by quantity.service.ts. invoiceQty/pendingQty/pendingAmount are
 * not persisted at all (see quantity.service.ts's toQuantityDto) — nothing
 * here ever touches them.
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

/**
 * Sum of every QuantityItem.woValue for a project — i.e. the backend
 * equivalent of the frontend's workOrderValueINR (calculateQuantity() sums
 * the exact same per-row field). Added for the Payment Milestones module
 * (see milestone.service.ts's computeAmount()), which needs a project's
 * Work Order Value to derive a milestone's amount but has no Quantity data
 * of its own — reusing this repository query, via a new exported service
 * function, avoids Milestones querying the QuantityItem table directly.
 */
export function sumWoValueByProjectId(projectId: string) {
  return prisma.quantityItem.aggregate({
    where: { projectId },
    _sum: { woValue: true },
  });
}
