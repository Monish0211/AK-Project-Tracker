import { AppError } from "../../../shared/utils/AppError.js";
import { getProjectById } from "../../projects/services/project.service.js";
import type { QuantityDto, QuantityListDto } from "../dto/quantity.dto.js";
import {
  createQuantity as createQuantityInRepository,
  deleteQuantity as deleteQuantityInRepository,
  getQuantityById,
  getQuantityByProjectId,
  updateQuantity as updateQuantityInRepository,
} from "../repository/quantity.repository.js";
import type { QuantityItemData } from "../quantity.types.js";
import type { CreateQuantityInput, UpdateQuantityInput } from "../validators/quantity.validators.js";

function toQuantityDto(row: Awaited<ReturnType<typeof getQuantityById>>): QuantityDto {
  if (!row) {
    throw new AppError("Quantity item not found.", 404);
  }

  return {
    id: row.id,
    projectId: row.projectId,
    description: row.description,
    woQty: row.woQty,
    invoiceQty: row.invoiceQty,
    pendingQty: row.pendingQty,
    uom: row.uom,
    assignedTo: row.assignedTo,
    currency: row.currency,
    unitRate: row.unitRate,
    exchangeRate: row.exchangeRate,
    unitRateINR: row.unitRateINR,
    woValue: row.woValue,
    pendingAmount: row.pendingAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Derives unitRateINR/woValue/pendingQty/pendingAmount from the fields a
 * client actually controls (woQty/invoiceQty/unitRate/exchangeRate/currency/
 * uom) — the exact same formula as recalcQuantityItem() in
 * frontend/src/utils/quantityCalculations.ts, so a future frontend
 * integration produces identical numbers whether calculated client-side or
 * re-derived here. Never trusts a client-submitted derived value.
 */
function computeDerivedFields(fields: {
  woQty: number;
  invoiceQty: number;
  uom: string;
  currency: string;
  unitRate: number;
  exchangeRate: number;
}): Pick<QuantityItemData, "unitRateINR" | "woValue" | "pendingQty" | "pendingAmount"> {
  const isLumpSum = fields.uom.trim().toUpperCase() === "LUMP SUM";

  const unitRateINR = fields.currency === "INR" ? fields.unitRate : fields.unitRate * fields.exchangeRate;

  const woValue = isLumpSum ? unitRateINR : fields.woQty * unitRateINR;

  const pendingQty = isLumpSum
    ? Math.max(1 - fields.invoiceQty, 0)
    : Math.max(fields.woQty - fields.invoiceQty, 0);

  const pendingAmount = pendingQty * unitRateINR;

  return { unitRateINR, woValue, pendingQty, pendingAmount };
}

/** Throws AppError(404) via getProjectById() if the project doesn't exist or is soft-deleted. */
async function assertProjectExists(projectId: string): Promise<void> {
  await getProjectById(projectId);
}

export async function createQuantityForProject(projectId: string, input: CreateQuantityInput): Promise<QuantityDto> {
  await assertProjectExists(projectId);

  const derived = computeDerivedFields({
    woQty: input.woQty,
    invoiceQty: input.invoiceQty,
    uom: input.uom,
    currency: input.currency,
    unitRate: input.unitRate,
    exchangeRate: input.exchangeRate,
  });

  const data: QuantityItemData = {
    description: input.description,
    woQty: input.woQty,
    invoiceQty: input.invoiceQty,
    uom: input.uom,
    assignedTo: input.assignedTo ?? null,
    currency: input.currency,
    unitRate: input.unitRate,
    exchangeRate: input.exchangeRate,
    ...derived,
  };

  const created = await createQuantityInRepository(projectId, data);
  return toQuantityDto(created);
}

export async function listQuantityForProject(projectId: string): Promise<QuantityListDto> {
  await assertProjectExists(projectId);

  const rows = await getQuantityByProjectId(projectId);
  return { items: rows.map((row) => toQuantityDto(row)) };
}

export async function updateQuantityItem(id: string, input: UpdateQuantityInput): Promise<QuantityDto> {
  const existing = await getQuantityById(id);
  if (!existing) {
    throw new AppError("Quantity item not found.", 404);
  }

  const merged = {
    woQty: input.woQty ?? existing.woQty,
    invoiceQty: input.invoiceQty ?? existing.invoiceQty,
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

  return toQuantityDto(updated);
}

export async function deleteQuantityItem(id: string): Promise<void> {
  const existing = await getQuantityById(id);
  if (!existing) {
    throw new AppError("Quantity item not found.", 404);
  }

  await deleteQuantityInRepository(id);
}
