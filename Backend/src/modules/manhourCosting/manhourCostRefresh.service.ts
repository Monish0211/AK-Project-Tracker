import { prisma } from "../../shared/utils/prismaClient.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { AccessTokenPayload } from "../../shared/types/auth.types.js";
import { regionalSnapshotFields } from "../manhourRates/manhourSnapshot.js";
import {
  bumpTaskAttempt,
  closeTasks,
  createRun,
  findAffectedProjectIds,
  findOpenTasksForEmployeeProject,
  findPrNos,
  findProjectIdsInCountryScope,
  findRun,
  findTask,
  insertCostAudit,
  listInterruptedRunIds,
  listOpenRuns,
  lockProjectCosting,
  lockResourcePair,
  markTaskFailed,
  markTaskSucceeded,
  setRunStatus,
  updateRunProgress,
} from "./manhourCosting.repository.js";
import { REFRESH_RUN_STATUS, REFRESH_TASK_STATUS, inrManpowerCost, runStatusFromTasks } from "./manhourCosting.rules.js";
import type { RateChangeSource, RefreshRunStatus } from "./manhourCosting.rules.js";
import { AppError } from "../../shared/utils/AppError.js";
import { projectCountryWhere, projectIdsInCountryScope } from "../../shared/utils/countryAccess.js";

/**
 * Phase 4 / Option A - automatic manpower recalculation when an employee's hourly rate changes.
 *
 * recordRateChangeRun() runs INSIDE the transaction that saves the new rate, so the rate and the list of projects that must be recalculated are
 * committed together: the rate can never be saved with the recalculation forgotten. processRun() then recalculates each project in its own
 * transaction. Every task reads the employee's CURRENT saved rate when it executes (a retry never applies an obsolete rate), recomputes each row
 * from absolute inputs (hours x current rate, regional with the row's own FX version), so running it twice changes nothing and double-counts
 * nothing, and it takes the same locks as the timesheet recompute (per pair) and the FX apply (per project), so none of them can interleave.
 * A project whose task did not succeed is reported as refresh PENDING or FAILED everywhere; nothing is shown as current while it is not.
 */

export interface RecordRunInput {
  employeeNo: string;
  previousEmployeeNo?: string | null;
  previousRate: number | null;
  newRate: number;
  source: RateChangeSource;
  actor: Pick<AccessTokenPayload, "sub" | "email" | "roleName"> | null;
}

export interface RefreshSummary {
  runId: string;
  status: RefreshRunStatus;
  projectCount: number;
  succeededCount: number;
  failedCount: number;
}

/**
 * Records the run and one task per affected project, on the caller's transaction. Returns null when the employee has no project assignments:
 * a rate change for such an employee (and a brand-new employee) triggers no work at all.
 */
export async function recordRateChangeRun(tx: Prisma.TransactionClient, input: RecordRunInput): Promise<{ runId: string; projectCount: number } | null> {
  const employeeNos = [...new Set([input.employeeNo, input.previousEmployeeNo ?? input.employeeNo])];
  const projectIds = await findAffectedProjectIds(tx, employeeNos);
  if (projectIds.length === 0) return null;
  const user = input.actor ? await tx.portalUser.findUnique({ where: { id: input.actor.sub }, select: { fullName: true, email: true } }) : null;
  const actorName = input.actor ? user?.fullName?.trim() || user?.email || input.actor.email : "System";
  const run = await createRun(tx, {
    employeeNo: input.employeeNo,
    previousEmployeeNo: input.previousEmployeeNo && input.previousEmployeeNo !== input.employeeNo ? input.previousEmployeeNo : null,
    previousRate: input.previousRate,
    newRate: input.newRate,
    source: input.source,
    actorUserId: input.actor?.sub ?? null,
    actorName,
    actorRole: input.actor?.roleName ?? "System",
    projectIds,
  });
  return { runId: run.id, projectCount: run.projectCount };
}

function sameDecimal(a: { equals(other: unknown): boolean } | null, b: { equals(other: unknown): boolean } | null): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

/** Recalculates one project's rows for the employee from the CURRENT saved rate. Idempotent: rows already at the computed figures are left alone and not audited. */
async function processTask(taskId: string): Promise<void> {
  const task = await findTask(taskId);
  if (!task) return;
  const run = await findRun(task.runId);
  if (!run) return;
  const employeeNos = [...new Set([run.employeeNo, run.previousEmployeeNo ?? run.employeeNo])];
  await bumpTaskAttempt(taskId);
  let supersededRuns: string[] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        await lockProjectCosting(tx, task.projectId);
        const fresh = await findTask(taskId, tx);
        if (!fresh || fresh.status === REFRESH_TASK_STATUS.SUCCEEDED) return; // already done (a repeat or a concurrent retry): nothing to do

        // Which other open tasks this result will satisfy is decided BEFORE the rate is read: a task is only ever closed if its rate change was already
        // committed when the rate below is read, so a change that lands while this runs keeps its own task open and is processed next.
        const satisfiable = await findOpenTasksForEmployeeProject(tx, task.projectId, employeeNos, taskId);

        // The rate is read NOW, inside the transaction: never the value queued when the change was made.
        const employee = await tx.employee.findUnique({ where: { employeeNo: run.employeeNo } });
        if (!employee) throw new AppError(`Employee ${run.employeeNo} was not found, so its project costs cannot be recalculated.`, 409);
        const rate = employee.manhourExpenses;

        const rows = await tx.projectResource.findMany({ where: { projectId: task.projectId, employeeNo: { in: employeeNos } }, orderBy: { id: "asc" } });
        const audits: Prisma.ManhourCostChangeAuditCreateManyInput[] = [];
        for (const candidate of rows) {
          await lockResourcePair(tx, task.projectId, candidate.employeeNo);
          const row = await tx.projectResource.findUnique({ where: { id: candidate.id } }); // re-read after the pair lock: a timesheet recompute may have just changed the hours
          if (!row) continue;
          const costInr = inrManpowerCost(row.totalHours, rate);
          const regional = await regionalSnapshotFields(task.projectId, costInr, row, tx);
          const unchanged =
            row.hourlyRateSnapshot === rate &&
            row.manhourCost === costInr &&
            row.costingStatus === regional.costingStatus &&
            row.costCurrency === regional.costCurrency &&
            row.fxRateVersion === regional.fxRateVersion &&
            (row.fxRateScope ?? null) === regional.fxRateScope &&
            sameDecimal(row.manhourCostRegional, regional.manhourCostRegional);
          if (unchanged) continue;
          await tx.projectResource.update({
            where: { id: row.id },
            data: {
              hourlyRateSnapshot: rate,
              manhourCost: costInr,
              costCurrency: regional.costCurrency,
              costingStatus: regional.costingStatus,
              fxRateVersion: regional.fxRateVersion,
              fxRateInrPerRegional: regional.fxRateInrPerRegional,
              manhourCostRegional: regional.manhourCostRegional,
              rateSetAt: regional.rateSetAt,
              fxRateScope: regional.fxRateScope,
            },
          });
          audits.push({
            runId: run.id,
            taskId,
            projectId: task.projectId,
            projectResourceId: row.id,
            employeeNo: row.employeeNo,
            totalHours: row.totalHours,
            previousRate: row.hourlyRateSnapshot,
            newRate: rate,
            previousCostInr: row.manhourCost,
            newCostInr: costInr,
            costCurrency: regional.costCurrency,
            fxRateVersion: regional.fxRateVersion,
            fxRateInrPerRegional: regional.fxRateInrPerRegional,
            previousCostRegional: row.manhourCostRegional,
            newCostRegional: regional.manhourCostRegional,
            previousCostingStatus: row.costingStatus,
            newCostingStatus: regional.costingStatus,
          });
        }
        if (audits.length > 0) await insertCostAudit(tx, audits);
        await markTaskSucceeded(tx, taskId);
        supersededRuns = await closeTasks(tx, satisfiable);
      },
      { timeout: 60_000, maxWait: 30_000 }
    );
  } catch (err) {
    await markTaskFailed(taskId, err instanceof Error ? err.message : "Recalculation failed.");
    return;
  }
  // Earlier runs whose open task for this project was just satisfied by this same result: bring their overall status up to date.
  for (const otherRunId of supersededRuns) {
    if (otherRunId !== run.id) await syncRunStatus(otherRunId);
  }
}

async function syncRunStatus(runId: string): Promise<void> {
  const current = await findRun(runId);
  if (!current) return;
  const status = runStatusFromTasks(current.tasks.map((t) => t.status));
  const failed = current.tasks.find((t) => t.status === REFRESH_TASK_STATUS.FAILED);
  await updateRunProgress(runId, status, failed?.lastError ?? null);
}

/** Processes every task of a run that has not succeeded, then sets the run's overall status. Safe to call again (retry) and never throws. */
export async function processRun(runId: string, onlyProjectIds?: ReadonlySet<string> | null): Promise<RefreshSummary | null> {
  const run = await findRun(runId);
  if (!run) return null;
  await setRunStatus(runId, REFRESH_RUN_STATUS.PROCESSING);
  for (const task of run.tasks) {
    if (task.status === REFRESH_TASK_STATUS.SUCCEEDED) continue;
    if (onlyProjectIds && !onlyProjectIds.has(task.projectId)) continue; // another country's project: not this caller's to recalculate
    await processTask(task.id);
  }
  const after = await findRun(runId);
  const statuses = (after?.tasks ?? []).map((t) => t.status);
  const status = runStatusFromTasks(statuses);
  const failed = (after?.tasks ?? []).find((t) => t.status === REFRESH_TASK_STATUS.FAILED);
  const updated = await updateRunProgress(runId, status, failed?.lastError ?? null);
  return { runId, status, projectCount: updated.projectCount, succeededCount: updated.succeededCount, failedCount: updated.failedCount };
}

/** Processes a freshly recorded run; any unexpected error leaves the run visibly PENDING/FAILED (never reported as done). */
export async function processRunSafely(runId: string): Promise<RefreshSummary | null> {
  try {
    return await processRun(runId);
  } catch {
    const run = await findRun(runId);
    return run
      ? { runId, status: run.status as RefreshRunStatus, projectCount: run.projectCount, succeededCount: run.succeededCount, failedCount: run.failedCount }
      : null;
  }
}

/** Retry of a run from the visible failed / pending state. Uses the latest saved employee rate, not the queued one. */
export async function retryRun(runId: string, user?: AccessTokenPayload): Promise<RefreshSummary> {
  // Multi-country: a retry recalculates, so it may only touch projects of the countries the caller holds; the others stay exactly as they were (still pending / failed for
  // someone who holds them). A run with none of the caller's projects reads as not found, the same answer as an unknown id. With country access off, or for the explicit
  // All Countries right, nothing is limited and this is exactly what it was.
  const allowed = user ? await projectIdsInCountryScope((await findRun(runId))?.tasks.map((t) => t.projectId) ?? [], user) : null;
  if (allowed && allowed.size === 0) throw new AppError("Recalculation run not found.", 404);
  const summary = await processRun(runId, allowed);
  if (!summary) throw new AppError("Recalculation run not found.", 404);
  if (!allowed) return summary;
  // The answer covers only the caller's own projects (counts of another country's projects are not theirs to see).
  const after = await findRun(runId);
  const mine = (after?.tasks ?? []).filter((t) => allowed.has(t.projectId));
  const succeeded = mine.filter((t) => t.status === REFRESH_TASK_STATUS.SUCCEEDED).length;
  return { runId, status: runStatusFromTasks(mine.map((t) => t.status)), projectCount: mine.length, succeededCount: succeeded, failedCount: mine.filter((t) => t.status === REFRESH_TASK_STATUS.FAILED).length };
}

export interface OpenRunDto {
  runId: string;
  employeeNo: string;
  source: string;
  previousRate: number | null;
  newRate: number;
  status: string;
  actorName: string;
  createdAt: Date;
  lastError: string | null;
  openProjects: { taskId: string; projectId: string; prNo: string; status: string; attempts: number; lastError: string | null }[];
}

/** Runs that still have a project pending or failed: the visible recovery list for authorised users. */
export async function listOpenRefreshRuns(user?: AccessTokenPayload): Promise<OpenRunDto[]> {
  const allRuns = await listOpenRuns();
  // Multi-country: a user sees only the projects of the countries they are authorized for (the list names projects, so another country's must not appear). With country
  // access off, or for the explicit All Countries right, there is no country scope and the list is exactly what it was.
  const countryWhere = user ? projectCountryWhere(user) : undefined;
  const visible = countryWhere ? await findProjectIdsInCountryScope([...new Set(allRuns.flatMap((r) => r.tasks.map((t) => t.projectId)))], countryWhere) : null;
  const runs = visible ? allRuns.map((r) => ({ ...r, tasks: r.tasks.filter((t) => visible.has(t.projectId)) })) : allRuns;
  const projectIds = [...new Set(runs.flatMap((r) => r.tasks.map((t) => t.projectId)))];
  const prNos = new Map((await findPrNos(projectIds)).map((p) => [p.id, p.prNo]));
  return runs
    .filter((r) => r.tasks.length > 0)
    .map((r) => ({
      runId: r.id,
      employeeNo: r.employeeNo,
      source: r.source,
      previousRate: r.previousRate,
      newRate: r.newRate,
      status: r.status,
      actorName: r.actorName,
      createdAt: r.createdAt,
      lastError: r.lastError,
      openProjects: r.tasks.map((t) => ({ taskId: t.id, projectId: t.projectId, prNo: prNos.get(t.projectId) ?? t.projectId, status: t.status, attempts: t.attempts, lastError: t.lastError })),
    }));
}

/** Crash recovery, run once when the server starts: finishes runs a restart interrupted. FAILED runs are never retried automatically. */
export async function resumeInterruptedRuns(): Promise<number> {
  const runs = await listInterruptedRunIds();
  for (const run of runs) await processRunSafely(run.id);
  return runs.length;
}
