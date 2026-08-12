import { prisma } from "../../../shared/utils/prismaClient.js";
import type { MilestoneData } from "../milestone.types.js";

/**
 * All Prisma access for Milestones lives here — the service layer never
 * imports `prisma` directly (same rule as quantity.repository.ts). No
 * business logic, no calculations — `amount` is never a column here at
 * all (see milestone.service.ts).
 */

export function createMilestone(projectId: string, data: MilestoneData) {
  return prisma.paymentMilestone.create({ data: { ...data, projectId } });
}

/**
 * Ingest-only — one atomic multi-row INSERT where each row supplies its own
 * `id` (honored by Prisma over the column's @default), preserving the
 * exact id InvoiceLine.milestoneId already references. Never called by the
 * ordinary create path. Pure Prisma passthrough — deliberately does NOT
 * catch a unique-constraint violation (e.g. from a concurrent ingest
 * inserting the same id first); that is business logic and is handled by
 * the caller. See milestone.service.ts's createMilestonesWithIdsSafely()
 * and ingestMilestonesForProject().
 */
export function createMilestonesWithIds(projectId: string, rows: Array<MilestoneData & { id: string }>) {
  return prisma.paymentMilestone.createManyAndReturn({
    data: rows.map((row) => ({ ...row, projectId })),
  });
}

export function getMilestonesByProjectId(projectId: string) {
  return prisma.paymentMilestone.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

export function getMilestoneById(id: string) {
  return prisma.paymentMilestone.findUnique({ where: { id } });
}

/** Ingest's idempotency/foreign-project bulk check — one query for the whole batch instead of one per row. */
export function getMilestonesByIds(ids: string[]) {
  return prisma.paymentMilestone.findMany({ where: { id: { in: ids } } });
}

export function updateMilestone(id: string, data: Partial<MilestoneData>) {
  return prisma.paymentMilestone.update({ where: { id }, data });
}

export function deleteMilestone(id: string) {
  return prisma.paymentMilestone.delete({ where: { id } });
}
