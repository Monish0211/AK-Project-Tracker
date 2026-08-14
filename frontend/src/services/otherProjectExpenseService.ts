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
interface BackendExpenseDto {
  id: string;
  projectId: string;
  category: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackendExpenseListDto {
  items: BackendExpenseDto[];
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

function toExpenseItem(dto: BackendExpenseDto): NonManhourExpense {
  return {
    id: dto.id,
    category: dto.category,
    description: dto.description,
    quantity: dto.quantity,
    unitCost: dto.unitCost,
    totalCost: dto.totalCost,
    remarks: dto.remarks ?? "",
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
 * matching backend id are created (POST), and backend rows no longer present
 * locally (removed via the row's Delete button) are DELETEd. Always ends
 * with a fresh GET so the caller displays exactly what the backend now
 * holds — never a value assembled from the individual write responses.
 */
export async function syncExpensesWithApi(projectId: string, localItems: NonManhourExpense[]): Promise<NonManhourExpense[]> {
  const existingResult = await apiClient.get<BackendExpenseListDto>(`/projects/${projectId}/expenses`);
  const backendById = new Map(existingResult.items.map((dto) => [dto.id, dto]));

  for (const item of localItems) {
    const existing = backendById.get(item.id);
    if (existing) {
      backendById.delete(item.id);
      if (hasExpenseChanged(existing, item)) {
        await apiClient.patch<BackendExpenseDto>(`/expenses/${item.id}`, toExpensePayload(item));
      }
    } else {
      await apiClient.post<BackendExpenseDto>(`/projects/${projectId}/expenses`, toExpensePayload(item));
    }
  }

  // Anything still in backendById was present in Postgres but no longer in
  // the local list — the user removed that row before Save.
  for (const staleId of backendById.keys()) {
    await apiClient.delete(`/expenses/${staleId}`);
  }

  return fetchExpensesFromApi(projectId);
}
