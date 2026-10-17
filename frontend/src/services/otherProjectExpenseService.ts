import type { NonManhourExpense } from "../types/NonManhourExpense";
import { getProjectById, getProjects, saveProjects } from "./projectService";
import { apiClient } from "./apiClient";

// =============================================================================
// PHASE 3.5 — BACKEND-CONNECTED OTHER PROJECT EXPENSES
// =============================================================================
// Same shape as Phase 3.3's Quantity wiring in quantityService.ts: PostgreSQL
// (via Backend/src/modules/expenses) is now authoritative for Other Project
// Expenses. The localStorage array the rest of the app already reads through
// getProjects()/getProjectById() stays a write-through MIRROR only — every
// function below ends by writing whatever the backend just returned into
// that same project's `nonManhourExpenses`, via the existing saveProjects()
// (which already fires "pmo:data-changed"). This is a completely separate
// module from Expense Budget (see expenseBudgetService.ts) — its own table,
// its own endpoints, its own business logic, per the Phase 3.5 design.

/** Raw shape one row of GET/POST/PATCH /projects/:projectId/expenses or /expenses/:id returns — see Backend's ExpenseDto. */
export interface BackendExpenseDto {
  id: string;
  projectId: string;
  category: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  remarks: string | null;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackendExpenseListDto {
  items: BackendExpenseDto[];
  count: number;
  latestUpdatedAt: string | null;
}

/** Cheap concurrency-awareness signal (Sept 2026) — see ExpenseListDto's own comment on the backend. Not used for data safety (removedExpenseIds is), only for the informational "someone else changed this" banner. */
export interface ExpensesConcurrencySignal {
  count: number;
  latestUpdatedAt: string | null;
}

// Populated every time fetchExpensesFromApi() runs, keyed by projectId — lets
// a caller capture "what did this project's expenses look like the moment
// Edit Project loaded" for free, without a dedicated extra network call.
const lastKnownMeta = new Map<string, ExpensesConcurrencySignal>();

/** The concurrency signal from the most recent fetchExpensesFromApi()/loadExpensesForProject() call for this project, if any — null before either has run. */
export function getLastKnownExpensesMeta(projectId: string): ExpensesConcurrencySignal | null {
  return lastKnownMeta.get(projectId) ?? null;
}

/** What the backend's Create/Update Expense endpoints accept — totalCost is deliberately excluded, since the backend derives it itself (see expense.service.ts's quantity * unitCost). */
interface ExpensePayload {
  category: string;
  description: string;
  quantity: number;
  unitCost: number;
  remarks: string | null;
}

function toExpensePayload(item: NonManhourExpense): ExpensePayload {
  return {
    category: item.category,
    description: item.description,
    quantity: item.quantity,
    unitCost: item.unitCost,
    remarks: item.remarks?.trim() ? item.remarks.trim() : null,
  };
}

export function toExpenseItem(dto: BackendExpenseDto): NonManhourExpense {
  return {
    id: dto.id,
    category: dto.category,
    description: dto.description,
    quantity: dto.quantity,
    unitCost: dto.unitCost,
    totalCost: dto.totalCost,
    remarks: dto.remarks ?? "",
    importBatchId: dto.importBatchId,
  };
}

/** Same fields toExpensePayload() sends — a row is "changed" only if one of these actually differs, so an untouched row costs zero PATCH calls on Save. */
function hasExpenseChanged(dto: BackendExpenseDto, item: NonManhourExpense): boolean {
  const payload = toExpensePayload(item);
  return (
    payload.category !== dto.category ||
    payload.description !== dto.description ||
    payload.quantity !== dto.quantity ||
    payload.unitCost !== dto.unitCost ||
    payload.remarks !== dto.remarks
  );
}

/** Upserts this project's nonManhourExpenses into the same localStorage array getProjects() reads, via the existing saveProjects() — mirrors quantityService.ts's writeQuantityIntoMirror(), scoped to one project's Other Project Expenses field only. */
function writeExpensesIntoMirror(projectId: string, items: NonManhourExpense[]): void {
  const projects = getProjects();
  const updated = projects.map((p) => (p.id === projectId ? { ...p, nonManhourExpenses: items } : p));
  saveProjects(updated);
}

/** Fresh Other Project Expenses list for a project — GET /projects/:projectId/expenses. */
export async function fetchExpensesFromApi(projectId: string): Promise<NonManhourExpense[]> {
  const result = await apiClient.get<BackendExpenseListDto>(`/projects/${projectId}/expenses`);
  const items = result.items.map(toExpenseItem);
  writeExpensesIntoMirror(projectId, items);
  lastKnownMeta.set(projectId, { count: result.count, latestUpdatedAt: result.latestUpdatedAt });
  return items;
}

/**
 * Opening Edit Project: loads Other Project Expenses from the backend. If
 * the backend has no rows yet for this project AND the local mirror already
 * has expense data (a project whose expenses were only ever saved to
 * localStorage, before this module existed on the backend), those legacy
 * rows are pushed to the backend once here — the same "touch it once, it
 * becomes a real backend row from then on" approach already used for
 * Quantity/Payment Milestones. A genuinely new/empty project just returns [].
 *
 * Legacy rows are snapshotted BEFORE fetchExpensesFromApi() runs — that call
 * always writes through to the mirror, even when the backend returns zero
 * rows, which would otherwise overwrite this project's nonManhourExpenses to
 * [] and destroy the very legacy data this function exists to migrate,
 * before it's ever read. This is the exact mirror-write-ordering bug logged
 * as TD-001 for quantityService.ts's own loadQuantityForProject() — fixed
 * here the same way paymentMilestoneService.ts's loadMilestonesForProject()
 * already fixes it, rather than repeating it in a brand-new module.
 */
export async function loadExpensesForProject(projectId: string): Promise<NonManhourExpense[]> {
  const legacyLocalItems = getProjectById(projectId)?.nonManhourExpenses ?? [];

  const backendItems = await fetchExpensesFromApi(projectId);
  if (backendItems.length > 0) {
    return backendItems;
  }

  if (legacyLocalItems.length === 0) {
    return backendItems;
  }

  const migrated: NonManhourExpense[] = [];
  for (const item of legacyLocalItems) {
    const created = await apiClient.post<BackendExpenseDto>(`/projects/${projectId}/expenses`, toExpensePayload(item));
    migrated.push(toExpenseItem(created));
  }

  writeExpensesIntoMirror(projectId, migrated);
  return migrated;
}

/**
 * Commits whatever's currently in `localItems` to the backend: rows already
 * known to the backend (by id) are PATCHed only if changed, rows with no
 * matching backend id are created (POST).
 *
 * Stale-save concurrency fix (Sept 2026) — deletion is driven ONLY by
 * `removedExpenseIds`, the explicit list of ids the user actually clicked
 * Delete on this session (see NonManhourExpenseCard.tsx's onExpenseRemoved /
 * ProjectForm.tsx's removedExpenseIds). This used to instead delete
 * "whatever the backend has that `localItems` didn't mention" — which is
 * indistinguishable from "a row this session never loaded in the first
 * place" (added by an Excel import, another tab, or another user after this
 * Edit Project session started). That inference was the entire bug: a
 * stale-but-otherwise-normal Save could silently delete rows nobody asked to
 * remove. Now, any backend row that's neither in `localItems` nor in
 * `removedExpenseIds` is left completely untouched — the final fresh GET
 * below naturally picks it up so the UI reflects it too, instead of erasing
 * it. This protects imported rows, manually-created rows, and rows added by
 * a concurrent tab/user identically — the fix is unconditional, not
 * source-specific.
 *
 * Always ends with a fresh GET so the caller displays exactly what the
 * backend now holds — never a value assembled from the individual write
 * responses.
 *
 * `concurrencyBaseline` (Sept 2026, informational only — see
 * ExpensesConcurrencySignal) is compared against this function's own initial
 * GET, already happening below regardless; if it differs, the returned
 * `concurrentChangeDetected` flag tells the caller to show the "someone else
 * changed this" banner. This never affects which rows get written — the
 * explicit `removedExpenseIds` rule above is unconditional either way.
 */
export async function syncExpensesWithApi(
  projectId: string,
  localItems: NonManhourExpense[],
  removedExpenseIds: string[] = [],
  concurrencyBaseline?: ExpensesConcurrencySignal | null
): Promise<{ items: NonManhourExpense[]; concurrentChangeDetected: boolean }> {
  const existingResult = await apiClient.get<BackendExpenseListDto>(`/projects/${projectId}/expenses`);
  const backendById = new Map(existingResult.items.map((dto) => [dto.id, dto]));
  const concurrentChangeDetected = !!concurrencyBaseline && (
    concurrencyBaseline.count !== existingResult.count ||
    concurrencyBaseline.latestUpdatedAt !== existingResult.latestUpdatedAt
  );

  for (const item of localItems) {
    const existing = backendById.get(item.id);
    if (existing) {
      if (hasExpenseChanged(existing, item)) {
        await apiClient.patch<BackendExpenseDto>(`/expenses/${item.id}`, toExpensePayload(item));
      }
    } else {
      await apiClient.post<BackendExpenseDto>(`/projects/${projectId}/expenses`, toExpensePayload(item));
    }
  }

  // Delete ONLY ids the user explicitly removed this session — never inferred
  // from absence. Guarded by backendById.has() so an id that was removed
  // locally but never actually reached the backend (e.g. a row added and
  // then deleted again in the same, never-saved session) doesn't trigger a
  // pointless DELETE call against an id Postgres never had.
  for (const removedId of removedExpenseIds) {
    if (backendById.has(removedId)) {
      await apiClient.delete(`/expenses/${removedId}`);
    }
  }

  const items = await fetchExpensesFromApi(projectId);
  return { items, concurrentChangeDetected };
}
