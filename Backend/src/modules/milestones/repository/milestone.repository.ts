import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import type { MilestoneData } from "../milestone.types.js";

/**
 * All Prisma access for Milestones lives here — the service layer never
 * imports `prisma` directly (same rule as quantity.repository.ts). No
 * business logic, no calculations — `amount` is never a column here at
 * all (see milestone.service.ts).
 */

/**
 * P0-07 (production hardening) — optional `tx`, same convention as
 * resource.repository.ts/timesheet.repository.ts's P1-04 fix: lets
 * milestone.service.ts read/write this inside its own advisory-locked
 * transaction so a concurrent create/update for the SAME project can never
 * interleave with the aggregate-percentage check. Defaults to the plain
 * client so every pre-existing caller is completely unaffected.
 */
export function createMilestone(
  projectId: string,
  data: MilestoneData,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  return tx.paymentMilestone.create({ data: { ...data, projectId } });
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

export function getMilestonesByProjectId(
  projectId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  return tx.paymentMilestone.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

export function getMilestoneById(id: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.paymentMilestone.findUnique({ where: { id } });
}

/** Ingest's idempotency/foreign-project bulk check — one query for the whole batch instead of one per row. */
export function getMilestonesByIds(ids: string[]) {
  return prisma.paymentMilestone.findMany({ where: { id: { in: ids } } });
}

export function updateMilestone(
  id: string,
  data: Partial<MilestoneData>,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  return tx.paymentMilestone.update({ where: { id }, data });
}

/** P13 — optional `tx` so deleteMilestoneItem() can run this INSIDE the same advisory-locked transaction as its own duplicate/invoice-line-reference check, same convention as getMilestoneById() above. */
export function deleteMilestone(id: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.paymentMilestone.delete({ where: { id } });
}
