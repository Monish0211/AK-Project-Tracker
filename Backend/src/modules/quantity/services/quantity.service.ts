import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectAccessById, assertProjectReadAccessById, authorizedProjectReadWhere } from "../../../shared/utils/projectAccess.js";
import type { BulkPage } from "../../../shared/utils/bulkPageQuery.js";
import { computeInvoiceProgress } from "../../../shared/utils/quantityProgress.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import {
  countNonCancelledLinesForQuantityItem,
  deleteCancelledLinesForQuantityItem,
  sumBilledQuantityByQuantityItemIds,
} from "../../invoices/repository/invoice.repository.js";
import type { QuantityDto, QuantityListDto, QuantityPageDto } from "../dto/quantity.dto.js";
import {
  countQuantityForProjects,
  createQuantity as createQuantityInRepository,
  deleteQuantity as deleteQuantityInRepository,
  getQuantityById,
  getQuantityForProjectsPage,
  getProjectRegionalCurrency,
  getQuantityByProjectId,
  sumWoValueByProjectId,
  updateQuantity as updateQuantityInRepository,
} from "../repository/quantity.repository.js";
import type { QuantityItemData } from "../quantity.types.js";
import { buildInvoiceAudit } from "../../invoices/invoiceAudit.js";
import type { CreateQuantityInput, UpdateQuantityInput } from "../validators/quantity.validators.js";
import { assertQuantityCurrency, computeQuantityAmounts, usesRegionalRules } from "../quantityCurrency.rules.js";

/**
 * billedQty is the sum of this item's non-Cancelled InvoiceLine.quantityBilled
 * rows — the caller fetches it (in bulk for a list, or once for a single
 * item) so this function itself never has to be async. See
 * shared/utils/quantityProgress.ts for the LUMP SUM ceiling rule.
 */
function toQuantityDto(row: Awaited<ReturnType<typeof getQuantityById>>, billedQty: number): QuantityDto {
  if (!row) {
    throw new AppError("Quantity item not found.", 404);
  }

  const { invoiceQty, pendingQty } = computeInvoiceProgress(row.woQty, row.uom, billedQty);
  // In the project's regional currency: for an India or legacy project that is INR (the row's regional price equals unitRateINR, or is
  // absent on a row saved before Phase 3), so this is exactly the long-standing figure.
  const pendingAmount = pendingQty * (row.unitRateRegional ?? row.unitRateINR);

  return {
    id: row.id,
    projectId: row.projectId,
    description: row.description,
    woQty: row.woQty,
    invoiceQty,
    pendingQty,
    uom: row.uom,
    assignedTo: row.assignedTo,
    currency: row.currency,
    unitRate: row.unitRate,
    exchangeRate: row.exchangeRate,
    unitRateINR: row.unitRateINR,
    woValue: row.woValue,
    pendingAmount,
    unitRateRegional: row.unitRateRegional,
    woValueRegional: row.woValueRegional,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Derives unitRateINR/woValue from the fields a client actually controls
 * (woQty/unitRate/exchangeRate/currency/uom) — the exact same formula as
 * recalcQuantityItem() in frontend/src/utils/quantityCalculations.ts, so a
 * future frontend integration produces identical numbers whether calculated
 * client-side or re-derived here. Never trusts a client-submitted derived
 * value. invoiceQty/pendingQty/pendingAmount are no longer part of this —
 * they depend on real invoicing activity, not on anything settable here
 * (see toQuantityDto() above).
 */
function computeDerivedFields(
  fields: {
    woQty: number;
    uom: string;
    currency: string;
    unitRate: number;
    exchangeRate: number;
  },
  regionalCurrency: string | null
): Pick<QuantityItemData, "exchangeRate" | "unitRateINR" | "woValue" | "unitRateRegional" | "woValueRegional"> {
  // Phase 3: the pure rules live in quantityCurrency.rules.ts. For a legacy project (no stored regional currency) and for an INR-region
  // project the INR figures are the original formulas byte for byte; any other region fills the regional columns and leaves INR at 0.
  return computeQuantityAmounts(fields, regionalCurrency);
}

/** Throws AppError(404) if the project doesn't exist, or 403 if the caller isn't authorized for it — see shared/utils/projectAccess.ts. */
async function assertProjectExists(projectId: string, user: AccessTokenPayload): Promise<void> {
  await assertProjectAccessById(projectId, user);
}

export async function createQuantityForProject(
  projectId: string,
  input: CreateQuantityInput,
  user: AccessTokenPayload
): Promise<QuantityDto> {
  await assertProjectExists(projectId, user);

  // Currency is validated against the PROJECT's stored regional currency (never the user's country or the selector).
  const regionalCurrency = await getProjectRegionalCurrency(projectId);
  assertQuantityCurrency(input.currency, input.exchangeRate, regionalCurrency);

  const derived = computeDerivedFields(
    {
      woQty: input.woQty,
      uom: input.uom,
      currency: input.currency,
      unitRate: input.unitRate,
      exchangeRate: input.exchangeRate,
    },
    regionalCurrency
  );

  const data: QuantityItemData = {
    description: input.description,
    woQty: input.woQty,
    uom: input.uom,
    assignedTo: input.assignedTo ?? null,
    currency: input.currency,
    unitRate: input.unitRate,
    // derived carries exchangeRate too: it is forced to 1 when the transaction currency is the project's regional currency.
    ...derived,
  };

  const created = await createQuantityInRepository(projectId, data);
  // A brand-new item cannot yet have any InvoiceLine referencing it.
  return toQuantityDto(created, 0);
}

export async function listQuantityForProject(projectId: string, user: AccessTokenPayload): Promise<QuantityListDto> {
  await assertProjectReadAccessById(projectId, user);

  const rows = await getQuantityByProjectId(projectId);
  const billedByItemId = await sumBilledQuantityByQuantityItemIds(rows.map((row) => row.id));
  return { items: rows.map((row) => toQuantityDto(row, billedByItemId.get(row.id) ?? 0)) };
}

/**
 * Reports data consistency (Oct 2026) — every Quantity row across the
 * projects the caller may read, one page at a time, mapped exactly like
 * listQuantityForProject() (same billed-quantity rollup per page of ids).
 */
export async function listAllAuthorizedQuantity(user: AccessTokenPayload, { page, pageSize }: BulkPage): Promise<QuantityPageDto> {
  const projectWhere = await authorizedProjectReadWhere(user);
  const [rows, total] = await Promise.all([
    getQuantityForProjectsPage(projectWhere, (page - 1) * pageSize, pageSize),
    countQuantityForProjects(projectWhere),
  ]);
  const billedByItemId = await sumBilledQuantityByQuantityItemIds(rows.map((row) => row.id));
  return { items: rows.map((row) => toQuantityDto(row, billedByItemId.get(row.id) ?? 0)), total, page, pageSize };
}

export async function updateQuantityItem(
  id: string,
  input: UpdateQuantityInput,
  user: AccessTokenPayload
): Promise<QuantityDto> {
  const existing = await getQuantityById(id);
  if (!existing) {
    throw new AppError("Quantity item not found.", 404);
  }
  await assertProjectAccessById(existing.projectId, user);

  const merged = {
    woQty: input.woQty ?? existing.woQty,
    uom: input.uom ?? existing.uom,
    currency: input.currency ?? existing.currency,
    unitRate: input.unitRate ?? existing.unitRate,
    exchangeRate: input.exchangeRate ?? existing.exchangeRate,
  };

  const regionalCurrency = await getProjectRegionalCurrency(existing.projectId);
  assertQuantityCurrency(merged.currency, merged.exchangeRate, regionalCurrency);
  const derived = computeDerivedFields(merged, regionalCurrency);

  const updated = await updateQuantityInRepository(id, {
    ...(input.description !== undefined && { description: input.description }),
    ...merged,
    ...(input.assignedTo !== undefined && { assignedTo: input.assignedTo }),
    ...derived,
  });

  const billedByItemId = await sumBilledQuantityByQuantityItemIds([id]);
  return toQuantityDto(updated, billedByItemId.get(id) ?? 0);
}

export async function deleteQuantityItem(id: string, user: AccessTokenPayload): Promise<void> {
  const existing = await getQuantityById(id);
  if (!existing) {
    throw new AppError("Quantity item not found.", 404);
  }
  await assertProjectAccessById(existing.projectId, user);

  const invoiceLineCount = await countNonCancelledLinesForQuantityItem(id);
  if (invoiceLineCount > 0) {
    throw new AppError(
      `This activity has ${invoiceLineCount} invoice line(s) raised against it and cannot be deleted.`,
      409
    );
  }

  // Any lines left at this point are Cancelled (see the count check above) —
  // clear them so the FK's onDelete: Restrict doesn't block this delete.
  await deleteCancelledLinesForQuantityItem(id, await buildInvoiceAudit(user, "quantity_activity_delete"));
  await deleteQuantityInRepository(id);
}

/**
 * Single-item lookup, exported for the Invoices module (Invoices →
 * Quantity, one direction only — see invoice.service.ts, which needs a
 * QuantityItem's current unitRateINR to derive a new InvoiceLine's
 * calculatedAmountINR and to build the joined "InvoiceItem" shape at read
 * time). Throws AppError(404) the same way every other lookup in this
 * service does, rather than returning null, so a caller never has to
 * duplicate the not-found check.
 */
export async function getQuantityItemById(id: string): Promise<QuantityDto> {
  const billedByItemId = await sumBilledQuantityByQuantityItemIds([id]);
  return toQuantityDto(await getQuantityById(id), billedByItemId.get(id) ?? 0);
}

/**
 * Phase 3 guard for the Invoices module. Invoicing (INR equivalents, GST, settlement) is built around INR-named amounts and has not been
 * extended to projects whose regional currency is not INR yet. Creating an invoice line there would silently produce wrong INR figures, so it
 * is refused with a clear message until that step is built. INR-region and legacy projects are untouched.
 */
export async function assertProjectInvoicable(projectId: string): Promise<void> {
  const regionalCurrency = await getRegionalInvoiceProjectCurrency(projectId);
  if (regionalCurrency !== null) {
    throw new AppError(
      `Invoicing is not available yet for a project whose currency is ${regionalCurrency}. The invoice module works in INR only, so an invoice here would produce wrong figures. India and legacy projects are not affected.`,
      409
    );
  }
}

/**
 * The project's regional currency when it is NOT INR (MYR, OMR, AED, QAR), otherwise null. null means an INR or legacy project, whose invoices follow the original INR
 * rules untouched. Read from the project's stored regional currency, never from its PR number or the user's country.
 */
export async function getRegionalInvoiceProjectCurrency(projectId: string): Promise<string | null> {
  const regionalCurrency = await getProjectRegionalCurrency(projectId);
  return usesRegionalRules(regionalCurrency) && regionalCurrency !== "INR" ? regionalCurrency : null;
}

/**
 * The backend equivalent of the frontend's workOrderValueINR — sum of every
 * QuantityItem.woValue for this project. Exported for the Payment
 * Milestones module (see milestone.service.ts's computeAmount()), which
 * needs a project's Work Order Value to derive a milestone's amount but has
 * no Quantity data of its own. Never throws on a project with zero Quantity
 * rows — returns 0, matching the frontend's own `|| 0` fallback everywhere
 * this value is read.
 */
export async function getWorkOrderValueForProject(projectId: string): Promise<number> {
  const [result, regionalCurrency] = await Promise.all([sumWoValueByProjectId(projectId), getProjectRegionalCurrency(projectId)]);
  // Phase 3: the Work Order Value in the project's REGIONAL currency. For a legacy or INR-region project that is the INR sum, exactly as
  // before; for any other region it is the regional sum (the INR column is 0 there by design).
  if (usesRegionalRules(regionalCurrency) && regionalCurrency !== "INR") return result._sum.woValueRegional ?? 0;
  return result._sum.woValue ?? 0;
}
