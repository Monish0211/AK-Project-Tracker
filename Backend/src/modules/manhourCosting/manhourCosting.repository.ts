import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { openApplyTaskStatusesByProject } from "../manhourRates/manhourRate.repository.js";
import { REFRESH_TASK_STATUS } from "./manhourCosting.rules.js";

/** All Prisma access for the automatic manpower recalculation (Phase 4 / Option A). No business rules here: see manhourCosting.rules.ts. */

type Db = Prisma.TransactionClient | typeof prisma;

/** The advisory lock a (project, employee) pair already uses in recomputeProjectResource: the same key, so the two can never interleave. */
export async function lockResourcePair(tx: Prisma.TransactionClient, projectId: string, employeeNo: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${projectId}::${employeeNo}`}))`;
}

/** The same per-project lock the manpower FX apply takes, so an employee refresh and an FX apply on one project are serialised. */
export async function lockProjectCosting(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`manhour-rate::${projectId}`}))`;
}

export async function findAffectedProjectIds(db: Db, employeeNos: string[]): Promise<string[]> {
  if (employeeNos.length === 0) return [];
  const rows = await db.projectResource.findMany({ where: { employeeNo: { in: employeeNos } }, select: { projectId: true }, distinct: ["projectId"] });
  return rows.map((r) => r.projectId);
}

export function createRun(
  tx: Prisma.TransactionClient,
  data: {
    employeeNo: string;
    previousEmployeeNo: string | null;
    previousRate: number | null;
    newRate: number;
    source: string;
    actorUserId: string | null;
    actorName: string;
    actorRole: string;
    projectIds: string[];
  }
) {
  const { projectIds, ...run } = data;
  return tx.manhourRateChangeRun.create({
    data: { ...run, projectCount: projectIds.length, tasks: { create: projectIds.map((projectId) => ({ projectId })) } },
    select: { id: true, projectCount: true },
  });
}

export function findRun(id: string, db: Db = prisma) {
  return db.manhourRateChangeRun.findUnique({ where: { id }, include: { tasks: { orderBy: { createdAt: "asc" } } } });
}

export function findTask(id: string, db: Db = prisma) {
  return db.manhourRefreshTask.findUnique({ where: { id } });
}

export function bumpTaskAttempt(taskId: string) {
  return prisma.manhourRefreshTask.update({ where: { id: taskId }, data: { attempts: { increment: 1 } } });
}

export function markTaskFailed(taskId: string, message: string) {
  return prisma.manhourRefreshTask.update({ where: { id: taskId }, data: { status: REFRESH_TASK_STATUS.FAILED, lastError: message.slice(0, 1000), finishedAt: new Date() } });
}

export function markTaskSucceeded(tx: Prisma.TransactionClient, taskId: string) {
  return tx.manhourRefreshTask.update({ where: { id: taskId }, data: { status: REFRESH_TASK_STATUS.SUCCEEDED, lastError: null, finishedAt: new Date() } });
}

/**
 * After a project is refreshed from the CURRENT employee rate, every other open task for the same employee and project (from earlier changes made
 * before this one completed) is satisfied by that same result: it is closed, never left pending against an obsolete rate.
 */
export function findOpenTasksForEmployeeProject(tx: Prisma.TransactionClient, projectId: string, employeeNos: string[], exceptTaskId: string) {
  return tx.manhourRefreshTask.findMany({
    where: { projectId, id: { not: exceptTaskId }, status: { not: REFRESH_TASK_STATUS.SUCCEEDED }, run: { employeeNo: { in: employeeNos } } },
    select: { id: true, runId: true },
  });
}

export async function closeTasks(tx: Prisma.TransactionClient, tasks: { id: string; runId: string }[]): Promise<string[]> {
  if (tasks.length === 0) return [];
  await tx.manhourRefreshTask.updateMany({
    where: { id: { in: tasks.map((t) => t.id) } },
    data: { status: REFRESH_TASK_STATUS.SUCCEEDED, lastError: null, finishedAt: new Date() },
  });
  return [...new Set(tasks.map((t) => t.runId))]; // the runs whose overall status may now be complete
}

export async function updateRunProgress(runId: string, status: string, lastError: string | null) {
  const tasks = await prisma.manhourRefreshTask.findMany({ where: { runId }, select: { status: true } });
  const succeeded = tasks.filter((t) => t.status === REFRESH_TASK_STATUS.SUCCEEDED).length;
  const failed = tasks.filter((t) => t.status === REFRESH_TASK_STATUS.FAILED).length;
  const done = status === "SUCCEEDED" || status === "PARTIAL" || status === "FAILED";
  return prisma.manhourRateChangeRun.update({
    where: { id: runId },
    data: { status, succeededCount: succeeded, failedCount: failed, lastError, ...(done ? { finishedAt: new Date() } : {}) },
  });
}

export function setRunStatus(runId: string, status: string) {
  return prisma.manhourRateChangeRun.update({ where: { id: runId }, data: { status } });
}

export function listOpenRuns() {
  return prisma.manhourRateChangeRun.findMany({
    where: { status: { not: "SUCCEEDED" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { tasks: { where: { status: { not: REFRESH_TASK_STATUS.SUCCEEDED } }, orderBy: { createdAt: "asc" } } },
  });
}

/** Runs a crash can leave behind: still PENDING or PROCESSING when the server restarts. FAILED runs are never retried automatically (they stay visible). */
export function listInterruptedRunIds() {
  return prisma.manhourRateChangeRun.findMany({ where: { status: { in: ["PENDING", "PROCESSING"] } }, select: { id: true }, orderBy: { createdAt: "asc" } });
}

/**
 * Per project, the statuses of every task that has not succeeded (PENDING or FAILED): the "refresh pending / failed" signal shown on every screen.
 * Both kinds of recalculation count: an employee-rate refresh and the application of a country conversion rate.
 */
export async function openTaskStatusesByProject(projectIds: string[], db: Db = prisma): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (projectIds.length === 0) return map;
  const rows = await db.manhourRefreshTask.findMany({
    where: { projectId: { in: projectIds }, status: { not: REFRESH_TASK_STATUS.SUCCEEDED } },
    select: { projectId: true, status: true },
  });
  for (const row of rows) {
    const list = map.get(row.projectId) ?? [];
    list.push(row.status);
    map.set(row.projectId, list);
  }
  for (const [projectId, statuses] of await openApplyTaskStatusesByProject(projectIds, db)) {
    map.set(projectId, [...(map.get(projectId) ?? []), ...statuses]);
  }
  return map;
}

export function insertCostAudit(tx: Prisma.TransactionClient, data: Prisma.ManhourCostChangeAuditCreateManyInput[]) {
  return tx.manhourCostChangeAudit.createMany({ data });
}

/** Of these projects, the ones inside a country scope (the request's active countries). Used to keep another country's projects out of a list. */
export async function findProjectIdsInCountryScope(projectIds: string[], countryWhere: Prisma.ProjectWhereInput): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const rows = await prisma.project.findMany({ where: { id: { in: projectIds }, ...countryWhere }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

export function findPrNos(projectIds: string[]) {
  return prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, prNo: true } });
}

export function findUserName(userId: string) {
  return prisma.portalUser.findUnique({ where: { id: userId }, select: { fullName: true, email: true } });
}
