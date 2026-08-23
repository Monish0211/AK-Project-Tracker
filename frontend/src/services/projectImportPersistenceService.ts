import { getProjects, saveProjects } from "./projectService";
import { loadQuantityForProject, fetchQuantityItemsFromApi } from "./quantityService";
import { loadMilestonesForProject, fetchMilestonesFromApi } from "./paymentMilestoneService";
import { loadExpensesForProject, fetchExpensesFromApi } from "./otherProjectExpenseService";
import type { Project } from "../types/Project";

/**
 * Excel Import's General Information call (bulkImportProjectGeneralInfo in
 * projectService.ts) only ever persists the Projects sheet — Quantity
 * Details / Payment Milestones / Expense Budget rows parseProjectsWorkbook()
 * already attached to each parsed Project travel only as far as the
 * localStorage mirror. This runs immediately after that call succeeds, once
 * per newly-created project, reusing the exact SAME lazy-migration
 * functions Edit Project's own "open a legacy-localStorage-only project"
 * path already relies on (loadQuantityForProject / loadMilestonesForProject
 * / loadExpensesForProject) — no new backend endpoint, no duplicated
 * validation/derivation logic, same ownership/authorization as every other
 * write in this app, since each just calls the project's own existing
 * Create endpoint under the hood.
 *
 * Lives in its own file rather than projectService.ts to avoid a circular
 * import: quantityService.ts / paymentMilestoneService.ts /
 * otherProjectExpenseService.ts already import getProjectById/getProjects/
 * saveProjects FROM projectService.ts.
 */

export interface ImportChildPersistenceCounts {
  expected: number;
  persisted: number;
  failed: boolean;
}

export interface ImportChildPersistenceReport {
  prNo: string;
  quantity: ImportChildPersistenceCounts;
  milestones: ImportChildPersistenceCounts;
  expenses: ImportChildPersistenceCounts;
}

/**
 * The Excel template has no free-text-required rule for Milestone Name (only
 * Payment % is enforced at parse time), but the backend's
 * createMilestoneSchema requires a non-empty name, and
 * loadMilestonesForProject()'s own isCompleteMilestone() check silently
 * treats a real, positive-percentage milestone with a blank name as
 * "incomplete" and never migrates it. Synthesizing a name here — only in
 * this outgoing-persistence step, never in parseProjectsWorkbook() or the
 * mirror the user sees before this runs — matches the exact fallback
 * precedent bulkImportProjectGeneralInfo() already uses for
 * workOrderNumber/workOrderDate/eicName.
 */
function backfillMilestoneNames(project: Project): boolean {
  let changed = false;
  project.paymentMilestones.forEach((m, idx) => {
    if (!m.milestoneName?.trim() && m.paymentPercentage > 0) {
      m.milestoneName = `Milestone ${idx + 1}`;
      changed = true;
    }
  });
  return changed;
}

/**
 * The Excel "Expense Budget" sheet has no Description column at all, so
 * every imported row parses with description: "". The backend's
 * createExpenseSchema requires a non-empty description, and
 * loadExpensesForProject()'s migration loop has no per-row try/catch — the
 * first such row throws and aborts the whole migration for that project.
 * Same fallback precedent as backfillMilestoneNames() above.
 */
function backfillExpenseDescriptions(project: Project): boolean {
  let changed = false;
  project.nonManhourExpenses.forEach((e) => {
    if (!e.description?.trim()) {
      e.description = e.category?.trim() ? e.category.trim() : "Imported expense";
      changed = true;
    }
  });
  return changed;
}

/** Applies both backfills directly to the local mirror, before any migration call reads it. */
function applyImportBackfills(projectId: string): void {
  const projects = getProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;

  const changedMilestones = backfillMilestoneNames(project);
  const changedExpenses = backfillExpenseDescriptions(project);
  if (changedMilestones || changedExpenses) {
    saveProjects(projects);
  }
}

async function persistOne<T>(expected: number, run: () => Promise<T[]>, recount: () => Promise<T[]>): Promise<ImportChildPersistenceCounts> {
  if (expected === 0) {
    return { expected: 0, persisted: 0, failed: false };
  }
  try {
    const result = await run();
    return { expected, persisted: result.length, failed: result.length < expected };
  } catch {
    let persisted = 0;
    try {
      persisted = (await recount()).length;
    } catch {
      persisted = 0;
    }
    return { expected, persisted, failed: true };
  }
}

/**
 * Persists every parsed Quantity/Milestone/Expense row for each just-created
 * project. Must be called AFTER bulkImportProjectGeneralInfo() has already
 * written the merged (real-id) projects into the local mirror, since the
 * lazy-migration functions this calls all read that mirror internally.
 */
export async function persistImportedProjectChildRecords(createdProjects: Project[]): Promise<ImportChildPersistenceReport[]> {
  const reports: ImportChildPersistenceReport[] = [];

  for (const created of createdProjects) {
    applyImportBackfills(created.id);

    const expectedQuantity = created.quantityItems?.length ?? 0;
    // Mirrors isCompleteMilestone()'s own criterion (paymentPercentage > 0) —
    // name is excluded from this check since the backfill above guarantees
    // every such row will have a non-empty name by the time migration runs.
    const expectedMilestones = (created.paymentMilestones ?? []).filter((m) => m.paymentPercentage > 0).length;
    const expectedExpenses = created.nonManhourExpenses?.length ?? 0;

    const quantity = await persistOne(
      expectedQuantity,
      () => loadQuantityForProject(created.id),
      () => fetchQuantityItemsFromApi(created.id)
    );
    const milestones = await persistOne(
      expectedMilestones,
      () => loadMilestonesForProject(created.id),
      () => fetchMilestonesFromApi(created.id)
    );
    const expenses = await persistOne(
      expectedExpenses,
      () => loadExpensesForProject(created.id),
      () => fetchExpensesFromApi(created.id)
    );

    reports.push({ prNo: created.prNo, quantity, milestones, expenses });
  }

  return reports;
}
