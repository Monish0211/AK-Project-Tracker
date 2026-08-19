import type { QuantityItem } from "../types/QuantityItem";
import { getProjectById, getProjects, saveProjects } from "./projectService";
import { apiClient } from "./apiClient";

// =============================================================================
// PHASE 3.3 — BACKEND-CONNECTED QUANTITY
// =============================================================================
// Same shape as Phase 3.1's General Information wiring in projectService.ts:
// PostgreSQL (via Backend/src/modules/quantity) is now authoritative for
// Quantity. The localStorage array the rest of the app already reads through
// getProjects()/getProjectById() stays a write-through MIRROR only — every
// function below ends by writing whatever the backend just returned into
// that same project's `quantityItems`, via the existing saveProjects()
// (which already fires "pmo:data-changed"), so Dashboard/Reports/Invoice
// sync/etc. keep working with zero changes of their own.

/** Raw shape one row of GET/POST/PATCH /projects/:projectId/quantity or /quantity/:id returns — see Backend's QuantityDto. */
interface BackendQuantityDto {
  id: string;
  projectId: string;
  description: string;
  woQty: number;
  invoiceQty: number;
  pendingQty: number;
  uom: string;
  assignedTo: string | null;
  currency: string;
  unitRate: number;
  exchangeRate: number;
  unitRateINR: number;
  woValue: number;
  pendingAmount: number;
  createdAt: string;
  updatedAt: string;
}

interface BackendQuantityListDto {
  items: BackendQuantityDto[];
}

/** What the backend's Create/Update Quantity endpoints accept — pendingQty/unitRateINR/woValue/pendingAmount are deliberately excluded, since the backend derives them itself (see quantity.service.ts's computeDerivedFields). */
interface QuantityPayload {
  description: string;
  woQty: number;
  invoiceQty: number;
  uom: string;
  assignedTo: string | null;
  currency: string;
  unitRate: number;
  exchangeRate: number;
}

function toQuantityPayload(item: QuantityItem): QuantityPayload {
  return {
    description: item.description,
    woQty: item.woQty,
    invoiceQty: item.invoiceQty,
    uom: item.uom,
    assignedTo: item.assignedTo?.trim() ? item.assignedTo.trim() : null,
    currency: item.currency,
    unitRate: item.unitRate,
    exchangeRate: item.exchangeRate,
  };
}

function toQuantityItem(dto: BackendQuantityDto): QuantityItem {
  return {
    id: dto.id,
    description: dto.description,
    woQty: dto.woQty,
    invoiceQty: dto.invoiceQty,
    pendingQty: dto.pendingQty,
    uom: dto.uom,
    assignedTo: dto.assignedTo ?? undefined,
    currency: dto.currency,
    unitRate: dto.unitRate,
    exchangeRate: dto.exchangeRate,
    unitRateINR: dto.unitRateINR,
    woValue: dto.woValue,
    pendingAmount: dto.pendingAmount,
  };
}

/** Same fields toQuantityPayload() sends — a row is "changed" only if one of these actually differs, so an untouched row costs zero PATCH calls on Save. */
function hasQuantityChanged(dto: BackendQuantityDto, item: QuantityItem): boolean {
  const payload = toQuantityPayload(item);
  return (
    payload.description !== dto.description ||
    payload.woQty !== dto.woQty ||
    payload.invoiceQty !== dto.invoiceQty ||
    payload.uom !== dto.uom ||
    payload.assignedTo !== dto.assignedTo ||
    payload.currency !== dto.currency ||
    payload.unitRate !== dto.unitRate ||
    payload.exchangeRate !== dto.exchangeRate
  );
}

/** Upserts this project's quantityItems into the same localStorage array getProjects() reads, via the existing saveProjects() — mirrors projectService.ts's writeThroughProjectsMirror(), scoped to one project's Quantity field only. */
function writeQuantityIntoMirror(projectId: string, items: QuantityItem[]): void {
  const projects = getProjects();
  const updated = projects.map((p) => (p.id === projectId ? { ...p, quantityItems: items } : p));
  saveProjects(updated);
}

/** Fresh Quantity list for a project — GET /projects/:projectId/quantity. */
export async function fetchQuantityItemsFromApi(projectId: string): Promise<QuantityItem[]> {
  const result = await apiClient.get<BackendQuantityListDto>(`/projects/${projectId}/quantity`);
  const items = result.items.map(toQuantityItem);
  writeQuantityIntoMirror(projectId, items);
  return items;
}

/**
 * Opening Edit Project: loads Quantity from the backend. If the backend has
 * no rows yet for this project AND the local mirror already has Quantity
 * data (a project whose activities were only ever saved to localStorage,
 * before this module existed on the backend — including a project just
 * brought in via Excel Import, whose parsed Quantity Details rows travel
 * only as far as the local mirror, see projectService.ts's
 * bulkImportProjectGeneralInfo()), those legacy rows are pushed to the
 * backend once here — the same "touch it once, it becomes a real backend
 * row from then on" approach already used for Excel Import's General
 * Information. A genuinely new/empty project just returns [].
 */
export async function loadQuantityForProject(projectId: string): Promise<QuantityItem[]> {
  // Snapshot any pre-existing local Quantity items BEFORE the GET below —
  // fetchQuantityItemsFromApi() always writes through to the mirror, even
  // when the backend returns zero rows, which would otherwise overwrite
  // this project's quantityItems to [] and destroy the very legacy data
  // this function exists to migrate, before it's ever read (same fix
  // paymentMilestoneService.ts's loadMilestonesForProject() already applies).
  const legacyLocalItems = getProjectById(projectId)?.quantityItems ?? [];

  const backendItems = await fetchQuantityItemsFromApi(projectId);
  if (backendItems.length > 0) {
    return backendItems;
  }

  if (legacyLocalItems.length === 0) {
    return backendItems;
  }

  const migrated: QuantityItem[] = [];
  for (const item of legacyLocalItems) {
    const created = await apiClient.post<BackendQuantityDto>(`/projects/${projectId}/quantity`, toQuantityPayload(item));
    migrated.push(toQuantityItem(created));
  }

  writeQuantityIntoMirror(projectId, migrated);
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
export async function syncQuantityItemsWithApi(projectId: string, localItems: QuantityItem[]): Promise<QuantityItem[]> {
  const existingResult = await apiClient.get<BackendQuantityListDto>(`/projects/${projectId}/quantity`);
  const backendById = new Map(existingResult.items.map((dto) => [dto.id, dto]));

  for (const item of localItems) {
    const existing = backendById.get(item.id);
    if (existing) {
      backendById.delete(item.id);
      if (hasQuantityChanged(existing, item)) {
        await apiClient.patch<BackendQuantityDto>(`/quantity/${item.id}`, toQuantityPayload(item));
      }
    } else {
      await apiClient.post<BackendQuantityDto>(`/projects/${projectId}/quantity`, toQuantityPayload(item));
    }
  }

  // Anything still in backendById was present in Postgres but no longer in
  // the local list — the user removed that row before Save.
  for (const staleId of backendById.keys()) {
    await apiClient.delete(`/quantity/${staleId}`);
  }

  return fetchQuantityItemsFromApi(projectId);
}
