import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import type { CandidateProject } from "../missingExpense.rules.js";

/**
 * Every live (non-archived) project with its count of persisted, active
 * Other Project Expenses rows — ONE query (Prisma renders the relation count
 * as a correlated subquery), no per-project round trips. Read-only: nothing
 * here creates, changes or deletes project or expense rows.
 *
 * isActive = false rows are imported rows superseded by a later import; the
 * Other Project Expenses screen never shows them, so they do not count as
 * "has expenses". Expense Budget (Project's own budget fields), man-hour
 * resources, timesheets and invoices are not consulted at all.
 */
export async function findCandidateProjects(): Promise<CandidateProject[]> {
  const rows = await prisma.project.findMany({
    where: { isDeleted: false },
    // A fixed input order makes the report's order fully deterministic (its own
    // sort is stable), so preview pages never shuffle between requests.
    orderBy: { id: "asc" },
    select: {
      id: true,
      prNo: true,
      client: true,
      projectTitle: true,
      primaryProjectManager: true,
      projectStatus: true,
      _count: { select: { projectExpenses: { where: { isActive: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    prNo: r.prNo,
    client: r.client,
    projectTitle: r.projectTitle,
    projectManager: r.primaryProjectManager,
    projectStatus: r.projectStatus,
    otherExpenseCount: r._count.projectExpenses,
  }));
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function findSetting(key: string) {
  return prisma.notificationSetting.findUnique({
    where: { key },
    include: {
      ccRecipients: { orderBy: { createdAt: "asc" }, include: { portalUser: { select: { id: true, fullName: true, email: true, isActive: true } } } },
      updatedBy: { select: { id: true, fullName: true } },
    },
  });
}

export interface CcRow {
  email: string;
  emailNormalized: string;
  portalUserId: string | null;
}

/** Replaces the To address and the whole CC list atomically. */
export async function saveSetting(key: string, toEmail: string, cc: CcRow[], updatedByUserId: string) {
  return prisma.$transaction(async (tx) => {
    const setting = await tx.notificationSetting.upsert({
      where: { key },
      create: { key, toEmail, updatedByUserId },
      update: { toEmail, updatedByUserId },
    });
    await tx.notificationCcRecipient.deleteMany({ where: { settingId: setting.id } });
    if (cc.length > 0) {
      await tx.notificationCcRecipient.createMany({ data: cc.map((c) => ({ ...c, settingId: setting.id })) });
    }
    return setting.id;
  });
}

/** Active PMO Portal users for the CC picker (real stored emails only). */
export async function findActiveUsersForPicker() {
  return prisma.portalUser.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, email: true, role: { select: { name: true } } },
    orderBy: { fullName: "asc" },
  });
}

export async function findUsersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.portalUser.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, isActive: true } });
}

export async function findUsersByEmails(emailsNormalized: string[]) {
  if (emailsNormalized.length === 0) return [];
  return prisma.portalUser.findMany({
    where: { email: { in: emailsNormalized, mode: "insensitive" } },
    select: { id: true, fullName: true, email: true, isActive: true },
  });
}

// ── Job runs (lock + idempotency record) ────────────────────────────────────

export async function createRun(data: { jobName: string; periodKey: string; trigger: string; claimToken: string }) {
  return prisma.scheduledJobRun.create({ data: { ...data, status: "RUNNING" } });
}

export async function findRun(jobName: string, periodKey: string) {
  return prisma.scheduledJobRun.findUnique({ where: { jobName_periodKey: { jobName, periodKey } } });
}

/**
 * Conditional takeover of an existing run row (FAILED retry, or an abandoned
 * RUNNING claim). Matches only while the row is still in `fromStatus` (and,
 * for abandoned claims, still older than `staleBefore`), so of two
 * concurrent callers exactly one gets count === 1.
 */
export async function reclaimRun(id: string, fromStatus: string, claimToken: string, staleBefore?: Date): Promise<boolean> {
  const result = await prisma.scheduledJobRun.updateMany({
    where: { id, status: fromStatus, ...(staleBefore ? { startedAt: { lt: staleBefore } } : {}) },
    data: { status: "RUNNING", claimToken, startedAt: new Date(), finishedAt: null, error: null, attempts: { increment: 1 } },
  });
  return result.count === 1;
}

/** Status transition guarded by the caller's claim token — a run that lost its claim can never overwrite it. */
export async function transitionRun(
  id: string,
  claimToken: string,
  fromStatus: string | string[],
  data: { status: string; eligibleCount?: number; missingCount?: number; recipientCount?: number; error?: string | null; finished?: boolean }
): Promise<boolean> {
  const { finished, ...rest } = data;
  const result = await prisma.scheduledJobRun.updateMany({
    where: { id, claimToken, status: Array.isArray(fromStatus) ? { in: fromStatus } : fromStatus },
    data: { ...rest, ...(finished ? { finishedAt: new Date() } : {}) },
  });
  return result.count === 1;
}

/** A send that started but never recorded its outcome (process died mid-send). */
export async function markDeliveryUnknown(id: string, staleBefore: Date): Promise<boolean> {
  const result = await prisma.scheduledJobRun.updateMany({
    where: { id, status: "SENDING", updatedAt: { lt: staleBefore } },
    data: { status: "DELIVERY_UNKNOWN", finishedAt: new Date(), error: "The send was interrupted; delivery could not be confirmed. Not re-sent automatically." },
  });
  return result.count === 1;
}

export async function findRecentRuns(jobName: string, take = 5) {
  return prisma.scheduledJobRun.findMany({ where: { jobName }, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take });
}

export type RunWhere = Prisma.ScheduledJobRunWhereInput;

/**
 * One page of a job's run history, newest first. `id` breaks ties between
 * runs started at the same instant, so pages never overlap or skip rows.
 * Served by the (jobName, startedAt) index; count + page in one round trip.
 */
export async function findRunsPage(jobName: string, where: RunWhere, skip: number, take: number) {
  const filter: RunWhere = { ...where, jobName };
  const [total, rows] = await prisma.$transaction([
    prisma.scheduledJobRun.count({ where: filter }),
    prisma.scheduledJobRun.findMany({ where: filter, orderBy: [{ startedAt: "desc" }, { id: "desc" }], skip, take }),
  ]);
  return { total, rows };
}

export async function countRuns(jobName: string) {
  return prisma.scheduledJobRun.count({ where: { jobName } });
}
