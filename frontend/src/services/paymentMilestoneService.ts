import type { Project } from "../types/Project";
import { getProjectById, getProjects, saveProjects } from "./projectService";
import { apiClient } from "./apiClient";

// =============================================================================
// PHASE 3.4 — BACKEND-CONNECTED PAYMENT MILESTONES
// =============================================================================
// Same shape as Phase 3.3's Quantity wiring in quantityService.ts: PostgreSQL
// (via Backend/src/modules/milestones) is now authoritative for Payment
// Milestones. The localStorage array the rest of the app already reads
// through getProjects()/getProjectById() stays a write-through MIRROR only —
// every function below ends by writing whatever the backend just returned
// into that same project's `paymentMilestones`, via the existing
// saveProjects() (which already fires "pmo:data-changed"), so
// Dashboard/Reports/Invoice/View keep working with zero changes of their own.
//
// One deliberate difference from Quantity: legacy/imported milestones are
// migrated via the backend's dedicated Ingest endpoint
// (POST /projects/:projectId/milestones/ingest), never the ordinary Create
// endpoint. Ingest preserves each milestone's existing id verbatim; Create
// always lets the backend assign a new one. InvoiceLine.milestoneId (still
// localStorage-only) already references a milestone by that exact id for
// any project with real invoice history — using Create for legacy data
// would silently orphan those references. Every sync after a milestone is
// first known to the backend (whether via Ingest or via a user adding a
// brand-new row) uses ordinary CRUD (Create/Update/Delete) — see
// syncMilestonesWithApi() below.

type PaymentMilestone = Project["paymentMilestones"][number];

/** Raw shape one row of GET/POST/PATCH /projects/:projectId/milestones, /milestones/:id, or the Ingest endpoint returns — see Backend's MilestoneDto. */
interface BackendMilestoneDto {
  id: string;
  projectId: string;
  milestoneName: string;
  paymentPercentage: number;
  dueDate: string | null;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

interface BackendMilestoneListDto {
  items: BackendMilestoneDto[];
}

interface IngestMilestonesResultDto {
  items: BackendMilestoneDto[];
}

/** What the backend's Create/Update Milestone endpoints accept — `amount` is deliberately excluded, since the backend derives it itself from paymentPercentage and the project's Work Order Value. */
interface MilestonePayload {
  milestoneName: string;
  paymentPercentage: number;
  dueDate: string | null;
}

/** Same as MilestonePayload, plus the id being adopted — Ingest-only, never sent by the ordinary create path. */
interface IngestMilestonePayload extends MilestonePayload {
  id: string;
}

function toMilestonePayload(item: PaymentMilestone): MilestonePayload {
  return {
    milestoneName: item.milestoneName?.trim() ?? "",
    paymentPercentage: item.paymentPercentage,
    dueDate: item.dueDate?.trim() ? item.dueDate : null,
  };
}

/** Full ISO datetime -> the "YYYY-MM-DD" a <input type="date"> requires — same conversion projectService.ts's toDateOnly() does for General Information dates. */
function toDateOnly(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function toMilestoneItem(dto: BackendMilestoneDto): PaymentMilestone {
  return {
    id: dto.id,
    milestoneName: dto.milestoneName,
    paymentPercentage: dto.paymentPercentage,
    dueDate: toDateOnly(dto.dueDate),
    amount: dto.amount,
  };
}

/** Same fields toMilestonePayload() sends — a row is "changed" only if one of these actually differs, so an untouched row costs zero PATCH calls on Save. Both sides normalized to the same null-or-bare-date representation so an unset date on both sides never falsely reports a change. */
function hasMilestoneChanged(dto: BackendMilestoneDto, item: PaymentMilestone): boolean {
  const payload = toMilestonePayload(item);
  const dtoDueDate = dto.dueDate ? dto.dueDate.slice(0, 10) : null;

  return (
    payload.milestoneName !== dto.milestoneName ||
    payload.paymentPercentage !== dto.paymentPercentage ||
    payload.dueDate !== dtoDueDate
  );
}

/** Upserts this project's paymentMilestones into the same localStorage array getProjects() reads, via the existing saveProjects() — mirrors quantityService.ts's writeQuantityIntoMirror(), scoped to one project's Payment Milestones field only. */
function writeMilestonesIntoMirror(projectId: string, items: PaymentMilestone[]): void {
  const projects = getProjects();
  const updated = projects.map((p) => (p.id === projectId ? { ...p, paymentMilestones: items } : p));
  saveProjects(updated);
}

/** Fresh Payment Milestones list for a project — GET /projects/:projectId/milestones. */
export async function fetchMilestonesFromApi(projectId: string): Promise<PaymentMilestone[]> {
  const result = await apiClient.get<BackendMilestoneListDto>(`/projects/${projectId}/milestones`);
  const items = result.items.map(toMilestoneItem);
  writeMilestonesIntoMirror(projectId, items);
  return items;
}

/** A row worth sending to Ingest — the same two conditions validatePaymentMilestonesTab() checks per row. Excludes createEmptyProject()'s own default filler milestone (empty name), which is otherwise indistinguishable from a real, not-yet-filled-in row and would only ever be rejected by the backend's validation. */
function isCompleteMilestone(item: PaymentMilestone): boolean {
  return !!item.milestoneName?.trim() && item.paymentPercentage > 0;
}

/**
 * Opening Edit Project: loads Payment Milestones from the backend. If the
 * backend has no rows yet for this project AND the local mirror already has
 * milestone data (a project whose payment schedule was only ever saved to
 * localStorage, before this module existed on the backend), those legacy
 * rows are pushed to the backend once here — via Ingest, never the ordinary
 * Create endpoint, so each migrated milestone keeps the exact id any
 * existing InvoiceLine.milestoneId reference already points at. A genuinely
 * new/empty project just returns [].
 *
 * Only COMPLETE local rows (see isCompleteMilestone()) are ever sent to
 * Ingest. An incomplete row — most commonly createEmptyProject()'s own
 * single default milestone, present in the mirror the moment any local
 * record exists for a project at all, even one that's never had its
 * Payments tab touched — would only ever be rejected by the backend's
 * validation (the same strictness as ordinary Create). Incomplete rows are
 * left exactly where they already were in the mirror, still visible and
 * editable in the UI; they migrate the normal way (ordinary Create, via
 * syncMilestonesWithApi) once the user actually fills them in and saves,
 * gated by validatePaymentMilestonesTab exactly like Quantity's own gate.
 */
export async function loadMilestonesForProject(projectId: string): Promise<PaymentMilestone[]> {
  // Snapshot any pre-existing local milestones BEFORE the GET below —
  // fetchMilestonesFromApi() always writes through to the mirror, even when
  // the backend returns zero rows, which would otherwise overwrite this
  // project's paymentMilestones to [] and destroy the very legacy data this
  // function exists to migrate, before it's ever read.
  const legacyLocalItems = getProjectById(projectId)?.paymentMilestones ?? [];

  const backendItems = await fetchMilestonesFromApi(projectId);
  if (backendItems.length > 0) {
    return backendItems;
  }

  const completeLegacyItems = legacyLocalItems.filter(isCompleteMilestone);
  if (completeLegacyItems.length === 0) {
    // Nothing worth migrating yet — most commonly a brand-new project's
    // still-unfilled default milestone row. fetchMilestonesFromApi() above
    // already wrote the (empty) backend result through to the mirror;
    // restore whatever was already there so the mirror and the rendered
    // state agree, and the starting row Add/Edit Project has always shown
    // doesn't disappear just because the backend has nothing yet.
    if (legacyLocalItems.length > 0) {
      writeMilestonesIntoMirror(projectId, legacyLocalItems);
    }
    return legacyLocalItems;
  }

  const incompleteLegacyItems = legacyLocalItems.filter((item) => !isCompleteMilestone(item));

  const payload: { milestones: IngestMilestonePayload[] } = {
    milestones: completeLegacyItems.map((item) => ({
      id: item.id,
      ...toMilestonePayload(item),
    })),
  };

  const result = await apiClient.post<IngestMilestonesResultDto>(`/projects/${projectId}/milestones/ingest`, payload);
  const migrated = result.items.map(toMilestoneItem);

  // Combine backend-confirmed rows with whatever incomplete rows were left
  // behind — nothing the user already had gets silently dropped from view.
  const combined = [...migrated, ...incompleteLegacyItems];

  writeMilestonesIntoMirror(projectId, combined);
  return combined;
}

/**
 * Commits whatever's currently in `localItems` to the backend: rows already
 * known to the backend (by id — whether adopted via Ingest above or created
 * previously by this same function) are PATCHed only if changed, rows with
 * no matching backend id are created (POST — ordinary Create, since a
 * brand-new row added via "Add Payment" has no existing Invoice reference
 * to preserve), and backend rows no longer present locally (removed via the
 * row's Delete button) are DELETEd. Never calls Ingest — Ingest is reserved
 * for adopting a not-yet-backend-known record on first load, above. Always
 * ends with a fresh GET so the caller displays exactly what the backend now
 * holds — never a value assembled from the individual write responses.
 */
export async function syncMilestonesWithApi(projectId: string, localItems: PaymentMilestone[]): Promise<PaymentMilestone[]> {
  const existingResult = await apiClient.get<BackendMilestoneListDto>(`/projects/${projectId}/milestones`);
  const backendById = new Map(existingResult.items.map((dto) => [dto.id, dto]));

  for (const item of localItems) {
    const existing = backendById.get(item.id);
    if (existing) {
      backendById.delete(item.id);
      if (hasMilestoneChanged(existing, item)) {
        await apiClient.patch<BackendMilestoneDto>(`/milestones/${item.id}`, toMilestonePayload(item));
      }
    } else {
      await apiClient.post<BackendMilestoneDto>(`/projects/${projectId}/milestones`, toMilestonePayload(item));
    }
  }

  // Anything still in backendById was present in Postgres but no longer in
  // the local list — the user removed that row before Save.
  for (const staleId of backendById.keys()) {
    await apiClient.delete(`/milestones/${staleId}`);
  }

  return fetchMilestonesFromApi(projectId);
}
