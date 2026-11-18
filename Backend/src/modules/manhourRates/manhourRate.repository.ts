import { randomUUID } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../shared/utils/prismaClient.js";

/**
 * All Prisma access for the manpower conversion rate (Phase 4, central country rates). No business rules here: see manhourCurrency.rules.ts and
 * countryRate.service.ts. The rate belongs to a COUNTRY (Region); a project reaches it through its stored regionId, never through its PR number.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export function findProjectBasics(projectId: string, db: Db = prisma) {
  return db.project.findUnique({ where: { id: projectId }, select: { id: true, prNo: true, regionId: true, regionalCurrency: true, isDeleted: true } });
}

export function findRegion(regionId: string, db: Db = prisma) {
  return db.region.findUnique({ where: { id: regionId } });
}

export function listActiveRegions(db: Db = prisma) {
  return db.region.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export function findLatestCountryRate(regionId: string, db: Db = prisma) {
  return db.countryManhourFxRate.findFirst({ where: { regionId }, orderBy: { version: "desc" } });
}

export function listCountryRates(regionId: string, db: Db = prisma) {
  return db.countryManhourFxRate.findMany({ where: { regionId }, orderBy: { version: "desc" } });
}

/** The latest version of every country that has one, in one query (the list screen). */
export async function latestCountryRates(db: Db = prisma) {
  const rows = await db.countryManhourFxRate.findMany({ orderBy: [{ regionId: "asc" }, { version: "desc" }] });
  const byRegion = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!byRegion.has(row.regionId)) byRegion.set(row.regionId, row);
  return byRegion;
}

/** Serialises concurrent writers for one country (new versions and applications), released at commit. */
export async function lockCountry(tx: Prisma.TransactionClient, regionId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`manhour-country-rate::${regionId}`}))`;
}

/** The same per-project lock the employee-rate recalculation takes, so a country apply and an employee refresh on one project are serialised. */
export async function lockProject(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`manhour-rate::${projectId}`}))`;
}

export function insertCountryRate(
  tx: Prisma.TransactionClient,
  data: {
    regionId: string;
    version: number;
    regionalCurrency: string;
    inrPerRegionalUnit: Prisma.Decimal;
    createdByUserId: string | null;
    createdByName: string;
    createdByRole: string;
    note: string | null;
  }
) {
  return tx.countryManhourFxRate.create({ data });
}

/** Non-deleted projects of a country, by their stored region (the PR Category mapping). */
export function listCountryProjects(regionId: string, db: Db = prisma) {
  return db.project.findMany({
    where: { regionId, isDeleted: false },
    select: { id: true, prNo: true, projectTitle: true, regionalCurrency: true },
    orderBy: { prNo: "asc" },
  });
}

export function listResourcesForProjects(projectIds: string[], db: Db = prisma) {
  return db.projectResource.findMany({ where: { projectId: { in: projectIds } }, orderBy: [{ projectId: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
}

export function updateResourceRegional(
  tx: Prisma.TransactionClient,
  id: string,
  data: {
    costCurrency: string;
    costingStatus: string;
    fxRateVersion: number | null;
    fxRateInrPerRegional: Prisma.Decimal | null;
    manhourCostRegional: Prisma.Decimal | null;
    rateSetAt: Date | null;
    fxRateScope: string | null;
  }
) {
  return tx.projectResource.update({ where: { id }, data });
}

export function insertRepriceAudit(tx: Prisma.TransactionClient, rows: Prisma.ProjectResourceRepriceAuditCreateManyInput[]) {
  return tx.projectResourceRepriceAudit.createMany({ data: rows });
}

export function newRunId(): string {
  return randomUUID();
}

export function findUserName(userId: string, db: Db = prisma) {
  return db.portalUser.findUnique({ where: { id: userId }, select: { fullName: true, email: true } });
}

/** True once the project has any manpower costing record: a ProjectResource row or a timesheet entry. Backs the country-change safety rule. */
export async function projectHasManhourCosting(projectId: string, db: Db = prisma): Promise<boolean> {
  const resources = await db.projectResource.count({ where: { projectId } });
  if (resources > 0) return true;
  const entries = await db.timesheetEntry.count({ where: { projectId } });
  return entries > 0;
}

// ---- country-rate application runs (one task per project) ---------------------------------------------------------------------------------------------

export function createApplyRun(
  tx: Prisma.TransactionClient,
  data: {
    regionId: string;
    regionName: string;
    targetVersion: number;
    reason: string | null;
    actorUserId: string | null;
    actorName: string;
    actorRole: string;
    projectIds: string[];
  }
) {
  const { projectIds, ...run } = data;
  return tx.countryRateApplyRun.create({
    data: { ...run, projectCount: projectIds.length, tasks: { create: projectIds.map((projectId) => ({ projectId })) } },
    select: { id: true, projectCount: true },
  });
}

export function findApplyRun(id: string, db: Db = prisma) {
  return db.countryRateApplyRun.findUnique({ where: { id }, include: { tasks: { orderBy: { createdAt: "asc" } } } });
}

export function findApplyTask(id: string, db: Db = prisma) {
  return db.countryRateApplyTask.findUnique({ where: { id } });
}

export function bumpApplyTaskAttempt(taskId: string) {
  return prisma.countryRateApplyTask.update({ where: { id: taskId }, data: { attempts: { increment: 1 } } });
}

export function markApplyTaskFailed(taskId: string, message: string) {
  return prisma.countryRateApplyTask.update({ where: { id: taskId }, data: { status: "FAILED", lastError: message.slice(0, 1000), finishedAt: new Date() } });
}

export function markApplyTaskSucceeded(tx: Prisma.TransactionClient, taskId: string) {
  return tx.countryRateApplyTask.update({ where: { id: taskId }, data: { status: "SUCCEEDED", lastError: null, finishedAt: new Date() } });
}

/** Open (not succeeded) tasks of OTHER runs for the same project: satisfied by the result of the task that is executing, so closed with it. */
export function findOpenApplyTasksForProject(tx: Prisma.TransactionClient, projectId: string, exceptTaskId: string) {
  return tx.countryRateApplyTask.findMany({ where: { projectId, id: { not: exceptTaskId }, status: { not: "SUCCEEDED" } }, select: { id: true, runId: true } });
}

export async function closeApplyTasks(tx: Prisma.TransactionClient, tasks: { id: string; runId: string }[]): Promise<string[]> {
  if (tasks.length === 0) return [];
  await tx.countryRateApplyTask.updateMany({ where: { id: { in: tasks.map((t) => t.id) } }, data: { status: "SUCCEEDED", lastError: null, finishedAt: new Date() } });
  return [...new Set(tasks.map((t) => t.runId))];
}

export async function updateApplyRunProgress(runId: string, status: string, lastError: string | null) {
  const tasks = await prisma.countryRateApplyTask.findMany({ where: { runId }, select: { status: true } });
  const succeeded = tasks.filter((t) => t.status === "SUCCEEDED").length;
  const failed = tasks.filter((t) => t.status === "FAILED").length;
  const done = status === "SUCCEEDED" || status === "PARTIAL" || status === "FAILED";
  return prisma.countryRateApplyRun.update({ where: { id: runId }, data: { status, succeededCount: succeeded, failedCount: failed, lastError, ...(done ? { finishedAt: new Date() } : {}) } });
}

export function setApplyRunStatus(runId: string, status: string) {
  return prisma.countryRateApplyRun.update({ where: { id: runId }, data: { status } });
}

export function listOpenApplyRuns() {
  return prisma.countryRateApplyRun.findMany({
    where: { status: { not: "SUCCEEDED" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { tasks: { where: { status: { not: "SUCCEEDED" } }, orderBy: { createdAt: "asc" } } },
  });
}

/** Runs a crash can leave behind: still PENDING or PROCESSING when the server restarts. FAILED runs are never retried automatically. */
export function listInterruptedApplyRunIds() {
  return prisma.countryRateApplyRun.findMany({ where: { status: { in: ["PENDING", "PROCESSING"] } }, select: { id: true }, orderBy: { createdAt: "asc" } });
}

export function findOpenApplyRunsForRegion(regionId: string, db: Db = prisma) {
  return db.countryRateApplyRun.findMany({ where: { regionId, status: { in: ["PENDING", "PROCESSING"] } }, select: { id: true } });
}

/** Per project, the statuses of every country-apply task that has not succeeded. Merged into the "refresh pending / failed" signal on every screen. */
export async function openApplyTaskStatusesByProject(projectIds: string[], db: Db = prisma): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (projectIds.length === 0) return map;
  const rows = await db.countryRateApplyTask.findMany({ where: { projectId: { in: projectIds }, status: { not: "SUCCEEDED" } }, select: { projectId: true, status: true } });
  for (const row of rows) {
    const list = map.get(row.projectId) ?? [];
    list.push(row.status);
    map.set(row.projectId, list);
  }
  return map;
}
