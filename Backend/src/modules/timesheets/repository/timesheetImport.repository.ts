import { prisma } from "../../../shared/utils/prismaClient.js";

/** All Prisma access for TimesheetImport (the audit header record) lives here. */

export interface TimesheetImportCreateData {
  emailMessageId?: string | null;
  attachmentId?: string | null;
  attachmentFilename?: string | null;
  receivedAt?: Date | null;
  triggeredBy: string;
  uploadedByUserId?: string | null;
}

/** status starts "Processing" — created only once the attachment/file bytes are already fully in hand (see mailPoll.service.ts / the manual-upload controller), so a download failure never leaves a stray "Pending" row with nothing to show for it. */
export function createImport(data: TimesheetImportCreateData) {
  return prisma.timesheetImport.create({
    data: { ...data, status: "Processing", processingStartedAt: new Date() },
  });
}

/** The duplicate-email guard — a different concern from row-level reconciliation (see schema.prisma's TimesheetImport model comment). */
export function findImportByEmailMessageId(emailMessageId: string) {
  return prisma.timesheetImport.findUnique({ where: { emailMessageId } });
}

/**
 * P2-08 — atomically claims an existing "Failed" TimesheetImport row for
 * retry by flipping it to "Processing", ONLY if it is still "Failed" at the
 * moment this UPDATE actually runs. `updateMany` with `status: "Failed"` in
 * the WHERE clause (not a separate read-then-write) is the whole
 * mechanism: Postgres serializes two concurrent UPDATEs to the SAME row
 * automatically (the second blocks until the first's transaction commits,
 * then re-evaluates its own WHERE clause against the now-committed value),
 * so if two mail-poll executions race to retry the same email, only the
 * FIRST one's WHERE clause can still match — the second's `count` comes
 * back 0 and it correctly backs off instead of starting a second,
 * duplicate reconciliation pass with the same import id. No advisory lock
 * or schema change needed; this is the row's own natural lock.
 * `processingFinishedAt` is reset to null so a stale timestamp from the
 * PRIOR failed attempt doesn't linger on what is now, again, an in-flight
 * row.
 */
export async function claimFailedImportForRetry(id: string): Promise<boolean> {
  const result = await prisma.timesheetImport.updateMany({
    where: { id, status: "Failed" },
    data: { status: "Processing", processingStartedAt: new Date(), processingFinishedAt: null },
  });
  return result.count === 1;
}

export type ImportRetryDecision =
  | { action: "processNew" }
  | { action: "retryExisting"; existingImportId: string }
  | { action: "skip"; reason: "alreadySucceeded" | "inProgress" | "retryLostRace" };

/**
 * P2-08 — the single decision point for "should this Keka emailMessageId
 * be processed now, retried, or skipped," called by mailPoll.service.ts
 * BEFORE ever downloading/parsing the attachment (so a message that will
 * just be skipped never triggers an unnecessary Graph attachment fetch).
 *
 * Only "Failed" is retry-eligible — deliberately narrower than "anything
 * that isn't Succeeded": "PartiallySucceeded" already committed real
 * TimesheetEntry writes for every row that validated (only individual rows
 * failed, not the whole transaction), so it is treated the same as
 * "Succeeded" here, matching this fix's scope (P2-08 is specifically about
 * a whole-transaction Failed import never being retried, not about
 * reprocessing partially-successful files). "Processing" (and the
 * theoretical, never-actually-assigned "Pending" — see createImport()'s
 * own comment) are treated as "another attempt is already in flight, don't
 * start a second one," exactly preserving today's behavior for those two
 * states.
 */
export async function decideImportEligibility(emailMessageId: string): Promise<ImportRetryDecision> {
  const existing = await findImportByEmailMessageId(emailMessageId);
  if (!existing) {
    return { action: "processNew" };
  }

  if (existing.status === "Failed") {
    const claimed = await claimFailedImportForRetry(existing.id);
    return claimed
      ? { action: "retryExisting", existingImportId: existing.id }
      : { action: "skip", reason: "retryLostRace" };
  }

  if (existing.status === "Processing" || existing.status === "Pending") {
    return { action: "skip", reason: "inProgress" };
  }

  return { action: "skip", reason: "alreadySucceeded" };
}

export function findImportById(id: string) {
  return prisma.timesheetImport.findUnique({ where: { id } });
}

export interface TimesheetImportFinalizeData {
  status: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  removedCount: number;
  failedCount: number;
  errorSummary?: string | null;
}

export function finalizeImport(id: string, data: TimesheetImportFinalizeData) {
  return prisma.timesheetImport.update({
    where: { id },
    data: { ...data, processingFinishedAt: new Date() },
  });
}

export function listImports(status: string | undefined, page: number, pageSize: number) {
  const where = status ? { status } : {};
  return Promise.all([
    prisma.timesheetImport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.timesheetImport.count({ where }),
  ]);
}
