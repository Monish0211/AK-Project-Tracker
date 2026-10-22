import type { InvoiceCurrency, InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../types/InvoiceItem";
import { isSupportedCurrency } from "../constants/currencies";
import { getProjectById, getProjects, saveProjects } from "./projectService";
import { apiClient } from "./apiClient";

// =============================================================================
// INVOICE BACKEND PHASE — FRONTEND INTEGRATION
// =============================================================================
// Same shape as quantityService.ts/paymentMilestoneService.ts: PostgreSQL
// (via Backend/src/modules/invoices) is now authoritative for Invoice lines.
// The localStorage array the rest of the app already reads through
// getProjects()/getProjectById() stays a write-through MIRROR only — every
// function below ends by writing whatever the backend just returned into
// that same project's `invoiceItems`, via the existing saveProjects(), so
// Dashboard/Reports keep working with zero changes of their own.
//
// One structural difference from Quantity/Milestones: there is no separate
// "InvoiceItem" table on the backend at all — GET /projects/:projectId/
// invoice-items returns one entry per QuantityItem belonging to the project
// (id === that QuantityItem's id, by construction), each carrying whatever
// InvoiceLine rows reference it. So "the backend has no rows yet" can't be
// tested by an empty items[] array the way Quantity/Milestones do — it's
// tested by every item's invoices[] being empty (see loadInvoiceForProject).

/** Raw shape one row of GET/POST/PATCH/Ingest .../invoice-lines or .../invoice-items returns — see Backend's InvoiceLineDto. */
interface BackendInvoiceLineDto {
  id: string;
  quantityItemId: string;
  invoiceNo: string;
  invoiceDate: string;
  milestoneId: string | null;
  milestoneName: string | null;
  setIndex: number | null;
  description: string | null;
  quantityBilled: number;
  unitPriceINR: number | null;
  calculatedAmountINR: number | null;
  invoiceAmountINR: number;
  commercialAdjustmentINR: number | null;
  // Invoice Currency feature (Oct 2026) — optional: a backend without the
  // feature doesn't send them, and toInvoiceLine() treats that as INR.
  currency?: string;
  exchangeRateToINR?: number;
  invoiceAmountOriginal?: number | null;
  clientReference: string | null;
  remarks: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Raw shape one row of GET /projects/:projectId/invoice-items returns — see Backend's InvoiceItemDto. id === the underlying QuantityItem's id. */
interface BackendInvoiceItemDto {
  id: string;
  description: string;
  qty: number;
  uom: string;
  unitPrice: number;
  totalPrice: number;
  invoices: BackendInvoiceLineDto[];
}

interface BackendInvoiceItemListDto {
  items: BackendInvoiceItemDto[];
}

interface IngestInvoiceLinesResultDto {
  items: BackendInvoiceLineDto[];
}

/**
 * What the backend's Create/Update InvoiceLine endpoints accept —
 * unitPriceINR/calculatedAmountINR/commercialAdjustmentINR are deliberately
 * excluded, since the backend derives them itself from the parent
 * QuantityItem's current rate (and the referenced Milestone's percentage, if
 * any) — see invoice.service.ts's createInvoiceLineForQuantityItem().
 */
interface InvoiceLinePayload {
  invoiceNo: string;
  invoiceDate: string;
  milestoneId: string | null;
  milestoneName: string | null;
  setIndex: number | null;
  description: string | null;
  quantityBilled: number;
  invoiceAmountINR: number;
  clientReference: string | null;
  remarks: string | null;
  status: InvoiceLineStatus;
  createdBy: string;
  // Invoice Currency feature (Oct 2026) — sent ONLY for a non-INR line (see
  // toInvoiceLinePayload()); an INR line's payload is byte-identical to
  // before this feature existed.
  currency?: InvoiceCurrency;
  exchangeRateToINR?: number;
  invoiceAmountOriginal?: number;
}

/** Same as InvoiceLinePayload, plus the id/quantityItemId being adopted and the historical snapshot fields preserved verbatim — Ingest-only, never sent by the ordinary create path. */
interface IngestInvoiceLinePayload extends InvoiceLinePayload {
  id: string;
  quantityItemId: string;
  unitPriceINR: number | null;
  calculatedAmountINR: number | null;
  commercialAdjustmentINR: number | null;
}

/** Full ISO datetime -> the "YYYY-MM-DD" a <input type="date"> requires — same conversion paymentMilestoneService.ts's toDateOnly() does for dueDate. */
function toDateOnly(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function toInvoiceLinePayload(line: InvoiceLine): InvoiceLinePayload {
  const currencyFields: Pick<InvoiceLinePayload, "currency" | "exchangeRateToINR" | "invoiceAmountOriginal"> =
    line.currency !== undefined && line.currency !== "INR"
      ? {
          currency: line.currency,
          exchangeRateToINR: line.exchangeRateToINR,
          invoiceAmountOriginal: line.invoiceAmountOriginal,
        }
      : {};
  return {
    ...currencyFields,
    invoiceNo: line.invoiceNo,
    invoiceDate: line.invoiceDate,
    milestoneId: line.milestoneId ?? null,
    milestoneName: line.milestoneName ?? null,
    setIndex: line.setIndex ?? null,
    description: line.description ?? null,
    quantityBilled: line.quantityBilled,
    invoiceAmountINR: line.invoiceAmountINR,
    clientReference: line.clientReference ?? null,
    remarks: line.remarks ?? null,
    status: line.status,
    createdBy: line.createdBy,
  };
}

function toInvoiceLine(dto: BackendInvoiceLineDto): InvoiceLine {
  return {
    id: dto.id,
    invoiceNo: dto.invoiceNo,
    invoiceDate: toDateOnly(dto.invoiceDate),
    milestoneId: dto.milestoneId ?? undefined,
    milestoneName: dto.milestoneName ?? undefined,
    setIndex: dto.setIndex ?? undefined,
    description: dto.description ?? undefined,
    quantityBilled: dto.quantityBilled,
    unitPriceINR: dto.unitPriceINR ?? undefined,
    calculatedAmountINR: dto.calculatedAmountINR ?? undefined,
    invoiceAmountINR: dto.invoiceAmountINR,
    commercialAdjustmentINR: dto.commercialAdjustmentINR ?? undefined,
    // Missing/legacy/unknown currency fields are read as INR, never a foreign currency.
    currency: isSupportedCurrency(dto.currency) ? dto.currency : "INR",
    exchangeRateToINR: typeof dto.exchangeRateToINR === "number" ? dto.exchangeRateToINR : 1,
    invoiceAmountOriginal: typeof dto.invoiceAmountOriginal === "number" ? dto.invoiceAmountOriginal : dto.invoiceAmountINR,
    clientReference: dto.clientReference ?? undefined,
    remarks: dto.remarks ?? undefined,
    status: dto.status as InvoiceLineStatus,
    createdBy: dto.createdBy,
  };
}

function toInvoiceItem(dto: BackendInvoiceItemDto): InvoiceItem {
  return {
    id: dto.id,
    description: dto.description,
    qty: dto.qty,
    uom: dto.uom,
    unitPrice: dto.unitPrice,
    totalPrice: dto.totalPrice,
    invoices: dto.invoices.map(toInvoiceLine),
  };
}

/** Same fields toInvoiceLinePayload() sends — a row is "changed" only if one of these actually differs, so an untouched line costs zero PATCH calls. */
function hasInvoiceLineChanged(existing: InvoiceLine, next: InvoiceLine): boolean {
  const a = toInvoiceLinePayload(existing);
  const b = toInvoiceLinePayload(next);
  return (
    a.invoiceNo !== b.invoiceNo ||
    a.invoiceDate !== b.invoiceDate ||
    a.milestoneId !== b.milestoneId ||
    a.milestoneName !== b.milestoneName ||
    a.setIndex !== b.setIndex ||
    a.description !== b.description ||
    a.quantityBilled !== b.quantityBilled ||
    a.invoiceAmountINR !== b.invoiceAmountINR ||
    a.invoiceAmountOriginal !== b.invoiceAmountOriginal ||
    a.clientReference !== b.clientReference ||
    a.remarks !== b.remarks ||
    a.status !== b.status
  );
}

/** Upserts this project's invoiceItems into the same localStorage array getProjects() reads, via the existing saveProjects() — mirrors quantityService.ts's writeQuantityIntoMirror(), scoped to one project's Invoice field only. */
function writeInvoiceItemsIntoMirror(projectId: string, items: InvoiceItem[]): void {
  const projects = getProjects();
  const updated = projects.map((p) => (p.id === projectId ? { ...p, invoiceItems: items } : p));
  saveProjects(updated);
}

/** One row of GET /invoice-items — see Backend's invoice.service.ts::listAllInvoiceLinesForCaller() / ReportInvoiceLineListDto. */
export interface ReportInvoiceLine {
  id: string;
  projectId: string;
  quantityItemId: string;
  status: string;
  invoiceAmountINR: number;
  invoiceDate: string;
  invoiceNo: string;
  quantityBilled: number;
  /** Invoice Currency feature (Oct 2026) — optional (older backends omit them). invoiceAmountINR stays the INR equivalent every Reports total sums. */
  currency?: string;
  exchangeRateToINR?: number;
  invoiceAmountOriginal?: number | null;
}

interface ReportInvoiceLineListDto {
  items: ReportInvoiceLine[];
}

/**
 * Sept 2026 — Reports/Dashboard Invoice Raised discrepancy fix. Every
 * invoice line across every project the caller is authorized to see, in one
 * request — GET /invoice-items, the same authorized-project + InvoiceLine
 * query the Dashboard's own Invoice Raised KPI is built from (see Backend's
 * dashboard.service.ts::getDashboardSummary()). Used by Reports.tsx instead
 * of each project's own browser-local invoiceItems mirror (only ever
 * populated by actually opening that project's Edit/View page at least once
 * in this browser, so a project never opened here was silently under-
 * counted). Never written to localStorage — a pure read for the caller's
 * own in-memory React state; business rules (which statuses count toward
 * Invoice Raised vs. Cash Realized, the per-project Work Order Value cap)
 * are applied by the caller, not here — see dashboard.formulas.ts's
 * invoiceRaisedFromLines()/paymentReceivedFromLines() for the exact rule.
 */
export async function fetchAllInvoiceLinesForCaller(): Promise<ReportInvoiceLine[]> {
  const result = await apiClient.get<ReportInvoiceLineListDto>("/invoice-items");
  return result.items;
}

/**
 * Invoice Currency feature (Oct 2026) — the project's CURRENT persisted
 * invoice-currency lock (ProjectDto.invoiceCurrency), re-read after every
 * invoice save/delete: the backend establishes the lock on a first raise and
 * may release it on a delete (see invoice.service.ts's deleteInvoiceLine()),
 * so the copy loaded with the project goes stale. undefined = the backend
 * doesn't report the field (older backend); callers then keep what they had.
 */
export async function fetchProjectInvoiceCurrency(projectId: string): Promise<string | null | undefined> {
  const dto = await apiClient.get<{ invoiceCurrency?: string | null }>(`/projects/${projectId}`);
  return dto.invoiceCurrency;
}

/** Fresh Invoice Items list for a project — GET /projects/:projectId/invoice-items. One entry per QuantityItem belonging to the project (id === that QuantityItem's id), each carrying its own InvoiceLine history. */
export async function fetchInvoiceItemsFromApi(projectId: string): Promise<InvoiceItem[]> {
  const items = await readInvoiceItemsFromApi(projectId);
  writeInvoiceItemsIntoMirror(projectId, items);
  return items;
}

/** The server's Invoice Items, read WITHOUT touching the local mirror — for callers that read several lists at once (projectSubresourceLoader.ts). */
export async function readInvoiceItemsFromApi(projectId: string): Promise<InvoiceItem[]> {
  const result = await apiClient.get<BackendInvoiceItemListDto>(`/projects/${projectId}/invoice-items`);
  return result.items.map(toInvoiceItem);
}

/**
 * Opening Edit Project: loads Invoice data from the backend. Quantity must
 * already be migrated for this project (loadQuantityForProject() runs
 * first in EditProject.tsx's load sequence) — the backend's GET always
 * returns one item per real QuantityItem, so this never returns [] the way
 * Quantity/Milestones' own "no rows yet" case does.
 *
 * "Already migrated?" is tested by whether the backend already knows about
 * ANY InvoiceLine at all (summed across every item's invoices[]) — a project
 * whose Quantity has been migrated but whose invoice history hasn't yet will
 * have real items but every invoices[] empty. If legacy localStorage history
 * exists, it is pushed once via the backend's Ingest endpoint (preserving
 * each line's exact id/invoiceNo/date/milestone/quantityBilled/historical
 * unitPriceINR/calculatedAmountINR/invoiceAmountINR/commercialAdjustmentINR/
 * clientReference/remarks/status/createdBy — see IngestInvoiceLinePayload),
 * never the ordinary Create endpoint, so any existing
 * notificationTypes.ts invoiceLineId deep-link keeps resolving. A genuinely
 * new project (or one with no invoice history yet) just returns the
 * backend's already-correct, all-empty items.
 */
export async function loadInvoiceForProject(projectId: string, prefetched?: InvoiceItem[]): Promise<InvoiceItem[]> {
  // Snapshot any pre-existing local invoice history BEFORE the GET below —
  // fetchInvoiceItemsFromApi() always writes through to the mirror, which
  // would otherwise overwrite this project's invoiceItems with the (still
  // un-migrated) backend shape before the legacy `.invoices[]` data below is
  // ever read.
  const legacyLocalItems = getProjectById(projectId)?.invoiceItems ?? [];

  // `prefetched` = the list already read by the caller; applying it is what fetchInvoiceItemsFromApi() does after its GET.
  let backendItems: InvoiceItem[];
  if (prefetched) {
    writeInvoiceItemsIntoMirror(projectId, prefetched);
    backendItems = prefetched;
  } else {
    backendItems = await fetchInvoiceItemsFromApi(projectId);
  }
  const backendLineCount = backendItems.reduce((sum, item) => sum + item.invoices.length, 0);
  if (backendLineCount > 0) {
    return backendItems;
  }

  const legacyLines: IngestInvoiceLinePayload[] = legacyLocalItems.flatMap((item) =>
    item.invoices.map((line) => ({
      id: line.id,
      quantityItemId: item.id,
      ...toInvoiceLinePayload(line),
      unitPriceINR: line.unitPriceINR ?? null,
      calculatedAmountINR: line.calculatedAmountINR ?? null,
      commercialAdjustmentINR: line.commercialAdjustmentINR ?? null,
    }))
  );

  if (legacyLines.length === 0) {
    return backendItems;
  }

  await apiClient.post<IngestInvoiceLinesResultDto>(`/projects/${projectId}/invoice-items/ingest`, {
    lines: legacyLines,
  });

  return fetchInvoiceItemsFromApi(projectId);
}

/**
 * Commits whatever's currently in `nextItems` to the backend by diffing
 * against `previousItems` at the individual InvoiceLine level: a line with
 * no matching id in `previousItems` is created (POST, nested under its
 * QuantityItem/InvoiceItem id), a line present in both but changed is
 * PATCHed, and a line present in `previousItems` but no longer in
 * `nextItems` is DELETEd (see invoice.service.ts's deleteInvoiceLine() — only
 * ever reachable here for a line the UI itself removed before it was ever
 * "raised", never for undoing an already-raised invoice, which is a status
 * PATCH to "Cancelled" instead). Always ends with a fresh GET so the caller
 * displays exactly what the backend now holds (real ids for anything just
 * created, current server-derived amounts) — never a value assembled from
 * the individual write responses, matching syncQuantityItemsWithApi()'s own
 * convention.
 */
/**
 * Request Invoice workflow (Sept 2026) — Section C: "Send Invoice To." A
 * separate, manual, post-raise action — never call this before the invoice
 * line has actually, successfully been saved (see syncInvoiceLinesWithApi()
 * above, always awaited first by every caller).
 */
/**
 * Manual invoice numbering (Oct 2026) — is this invoice number free
 * portal-wide? Used by the Raise Invoice form before it closes; the create
 * call remains the authority.
 */
export async function checkInvoiceNumberAvailability(
  projectId: string,
  invoiceNo: string
): Promise<{ invoiceNo: string; available: boolean; usedInThisProject: boolean }> {
  return apiClient.get(`/projects/${projectId}/invoice-numbers/availability?invoiceNo=${encodeURIComponent(invoiceNo)}`);
}

export async function sendInvoiceLineTo(invoiceLineId: string, userIds: string[]): Promise<{ sentTo: string[] }> {
  return apiClient.post<{ sentTo: string[] }>(`/invoice-lines/${invoiceLineId}/send-to`, { userIds });
}

export async function syncInvoiceLinesWithApi(
  projectId: string,
  previousItems: InvoiceItem[],
  nextItems: InvoiceItem[]
): Promise<InvoiceItem[]> {
  const previousLines = new Map<string, InvoiceLine>();
  for (const item of previousItems) {
    for (const line of item.invoices) {
      previousLines.set(line.id, line);
    }
  }

  const nextLineOwners = new Map<string, { line: InvoiceLine; quantityItemId: string }>();
  for (const item of nextItems) {
    for (const line of item.invoices) {
      nextLineOwners.set(line.id, { line, quantityItemId: item.id });
    }
  }

  // Manual invoice numbering (Oct 2026) — tell the backend whether each new
  // line STARTS a new invoice or joins one that already exists, so a new
  // invoice can never silently reopen/merge into an existing one (the
  // backend rejects "new" for any number already in use). The first line of
  // a number this project has never had is "new"; every other line is
  // "existing". Numbers compared ignoring case/outer spaces, as the backend does.
  const normalizeNo = (value: string) => value.trim().toUpperCase();
  const knownInvoiceNos = new Set(Array.from(previousLines.values(), (line) => normalizeNo(line.invoiceNo)));

  for (const [id, { line, quantityItemId }] of nextLineOwners) {
    const existing = previousLines.get(id);
    if (!existing) {
      const key = normalizeNo(line.invoiceNo);
      const invoiceIntent = knownInvoiceNos.has(key) ? "existing" : "new";
      knownInvoiceNos.add(key);
      await apiClient.post<BackendInvoiceLineDto>(`/quantity/${quantityItemId}/invoice-lines`, {
        ...toInvoiceLinePayload(line),
        invoiceIntent,
      });
    } else if (hasInvoiceLineChanged(existing, line)) {
      await apiClient.patch<BackendInvoiceLineDto>(`/invoice-lines/${id}`, toInvoiceLinePayload(line));
    }
  }

  // Anything in previousLines with no match in nextLineOwners was removed by
  // the UI (a workspace row unchecked / quantity cleared to 0) before Save.
  for (const staleId of previousLines.keys()) {
    if (!nextLineOwners.has(staleId)) {
      await apiClient.delete(`/invoice-lines/${staleId}`);
    }
  }

  return fetchInvoiceItemsFromApi(projectId);
}
