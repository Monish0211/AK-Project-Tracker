import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectAccessById } from "../../../shared/utils/projectAccess.js";
import { computeInvoiceProgress } from "../../../shared/utils/quantityProgress.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import {
  countNonCancelledLinesForQuantityItem,
  deleteCancelledLinesForQuantityItem,
  sumBilledQuantityByQuantityItemIds,
} from "../../invoices/repository/invoice.repository.js";
import type { QuantityDto, QuantityListDto } from "../dto/quantity.dto.js";
import {
  createQuantity as createQuantityInRepository,
  deleteQuantity as deleteQuantityInRepository,
  getQuantityById,
  getQuantityByProjectId,
  sumWoValueByProjectId,
  updateQuantity as updateQuantityInRepository,
} from "../repository/quantity.repository.js";
import type { QuantityItemData } from "../quantity.types.js";
import type { CreateQuantityInput, UpdateQuantityInput } from "../validators/quantity.validators.js";

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
  const pendingAmount = pendingQty * row.unitRateINR;

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
function computeDerivedFields(fields: {
  woQty: number;
  uom: string;
  currency: string;
  unitRate: number;
  exchangeRate: number;
}): Pick<QuantityItemData, "unitRateINR" | "woValue"> {
  const isLumpSum = fields.uom.trim().toUpperCase() === "LUMP SUM";

  const unitRateINR = fields.currency === "INR" ? fields.unitRate : fields.unitRate * fields.exchangeRate;

  const woValue = isLumpSum ? unitRateINR : fields.woQty * unitRateINR;

  return { unitRateINR, woValue };
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

  const derived = computeDerivedFields({
    woQty: input.woQty,
    uom: input.uom,
    currency: input.currency,
    unitRate: input.unitRate,
    exchangeRate: input.exchangeRate,
  });

  const data: QuantityItemData = {
    description: input.description,
    woQty: input.woQty,
    uom: input.uom,
    assignedTo: input.assignedTo ?? null,
    currency: input.currency,
    unitRate: input.unitRate,
    exchangeRate: input.exchangeRate,
    ...derived,
  };

  const created = await createQuantityInRepository(projectId, data);
  // A brand-new item cannot yet have any InvoiceLine referencing it.
  return toQuantityDto(created, 0);
}

export async function listQuantityForProject(projectId: string, user: AccessTokenPayload): Promise<QuantityListDto> {
  await assertProjectExists(projectId, user);

  const rows = await getQuantityByProjectId(projectId);
  const billedByItemId = await sumBilledQuantityByQuantityItemIds(rows.map((row) => row.id));
  return { items: rows.map((row) => toQuantityDto(row, billedByItemId.get(row.id) ?? 0)) };
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

  const derived = computeDerivedFields(merged);

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
  await deleteCancelledLinesForQuantityItem(id);
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
 * The backend equivalent of the frontend's workOrderValueINR — sum of every
 * QuantityItem.woValue for this project. Exported for the Payment
 * Milestones module (see milestone.service.ts's computeAmount()), which
 * needs a project's Work Order Value to derive a milestone's amount but has
 * no Quantity data of its own. Never throws on a project with zero Quantity
 * rows — returns 0, matching the frontend's own `|| 0` fallback everywhere
 * this value is read.
 */
export async function getWorkOrderValueForProject(projectId: string): Promise<number> {
  const result = await sumWoValueByProjectId(projectId);
  return result._sum.woValue ?? 0;
}
