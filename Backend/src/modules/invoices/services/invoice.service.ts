import { Prisma } from "../../../../generated/prisma/client.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectAccessById, getProjectCreatorUserId } from "../../../shared/utils/projectAccess.js";
import { notify, resolveProjectEventRecipients } from "../../notifications/notification.service.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { getMilestonePercentageById } from "../../milestones/services/milestone.service.js";
import { getQuantityItemById, listQuantityForProject } from "../../quantity/services/quantity.service.js";
import type { IngestInvoiceLinesResultDto, InvoiceItemDto, InvoiceItemListDto, InvoiceLineDto } from "../dto/invoice.dto.js";
import type { InvoiceLineData } from "../invoice.types.js";
import {
  createLine as createLineInRepository,
  createLinesWithIds,
  deleteLine as deleteLineInRepository,
  findConflictingLineForMilestone,
  getLineById,
  getLinesByIds,
  getLinesByQuantityItemIds,
  updateLine as updateLineInRepository,
} from "../repository/invoice.repository.js";
import type { CreateInvoiceLineInput, IngestInvoiceLinesInput, UpdateInvoiceLineInput } from "../validators/invoice.validators.js";

type InvoiceLineRow = NonNullable<Awaited<ReturnType<typeof getLineById>>>;
type IngestLineRow = IngestInvoiceLinesInput["lines"][number];

/** Same rounding as frontend/.../InvoiceCalculations.ts's round() — 2 decimal places, so a value computed here never differs from the equivalent client-side calculation by floating-point noise. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Priority #6 Phase 3B — ONE notification for a real invoice status
 * transition, called only from the two approved call sites below (creation
 * with a non-Draft status, and a PATCH that actually changes status).
 * Recipient resolution follows the same approved rule as Project events —
 * the project's real creator if known, otherwise Invoices module holders.
 */
async function notifyInvoiceStatusEvent(projectId: string, invoiceNo: string, message: string): Promise<void> {
  const createdByUserId = await getProjectCreatorUserId(projectId);
  const recipients = await resolveProjectEventRecipients(createdByUserId, "Invoices");
  await notify(recipients, {
    title: "Invoice Status Updated",
    message: `Invoice ${invoiceNo} ${message}`,
    type: "INVOICE_STATUS_CHANGED",
    severity: "Info",
    entityType: "Invoice",
    entityId: projectId,
  });
}

/** Same id — but is it actually the same data? Compared field-by-field, mirrors milestone.service.ts's milestoneMatchesPayload(). */
function lineMatchesPayload(existing: InvoiceLineRow, incoming: IngestLineRow): boolean {
  return (
    existing.quantityItemId === incoming.quantityItemId &&
    existing.invoiceNo === incoming.invoiceNo &&
    existing.invoiceDate.getTime() === incoming.invoiceDate.getTime() &&
    (existing.milestoneId ?? null) === (incoming.milestoneId ?? null) &&
    (existing.milestoneName ?? null) === (incoming.milestoneName ?? null) &&
    (existing.setIndex ?? null) === (incoming.setIndex ?? null) &&
    (existing.description ?? null) === (incoming.description ?? null) &&
    existing.quantityBilled === incoming.quantityBilled &&
    (existing.unitPriceINR ?? null) === (incoming.unitPriceINR ?? null) &&
    (existing.calculatedAmountINR ?? null) === (incoming.calculatedAmountINR ?? null) &&
    existing.invoiceAmountINR === incoming.invoiceAmountINR &&
    (existing.commercialAdjustmentINR ?? null) === (incoming.commercialAdjustmentINR ?? null) &&
    (existing.clientReference ?? null) === (incoming.clientReference ?? null) &&
    (existing.remarks ?? null) === (incoming.remarks ?? null) &&
    existing.status === incoming.status &&
    existing.createdBy === incoming.createdBy
  );
}

function toInvoiceLineDto(row: InvoiceLineRow): InvoiceLineDto {
  return {
    id: row.id,
    quantityItemId: row.quantityItemId,
    invoiceNo: row.invoiceNo,
    invoiceDate: row.invoiceDate,
    milestoneId: row.milestoneId,
    milestoneName: row.milestoneName,
    setIndex: row.setIndex,
    description: row.description,
    quantityBilled: row.quantityBilled,
    unitPriceINR: row.unitPriceINR,
    calculatedAmountINR: row.calculatedAmountINR,
    invoiceAmountINR: row.invoiceAmountINR,
    commercialAdjustmentINR: row.commercialAdjustmentINR,
    clientReference: row.clientReference,
    remarks: row.remarks,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The milestone percent to price a line against — 100 (full unit price, no
 * splitting) when no milestoneId is given (Invoice Line Items / Amount
 * Based methods), or the referenced PaymentMilestone's own percentage
 * (Lump Sum / MLMP methods), read cross-module from Milestones. Throws if a
 * milestoneId is supplied but doesn't resolve to a real milestone — a line
 * must never be silently priced against one that doesn't exist.
 */
async function resolveMilestonePercent(milestoneId: string | null | undefined): Promise<number> {
  if (!milestoneId) {
    return 100;
  }
  const percent = await getMilestonePercentageById(milestoneId);
  if (percent === null) {
    throw new AppError(`Milestone "${milestoneId}" was not found.`, 400);
  }
  return percent;
}

/**
 * calculatedAmountINR/commercialAdjustmentINR mean two different things
 * depending on whether a line is actually quantity-driven — reconfirmed by
 * live reproduction testing across all 4 invoice methods (synthetic
 * ZZZ-INVOICE-CALC-TEST project, 3 milestone configurations each):
 *
 * - quantityBilled > 0 — the ONLY case Invoice Line Items ever sends (its
 *   bulk workspace and RaiseInvoiceDrawer.tsx's edit flow). calculatedAmountINR
 *   is the quantity x unit rate x milestone % "system amount" (see
 *   frontend's getSystemAmount()); commercialAdjustmentINR is the gap
 *   between that and the entered invoiceAmountINR.
 *
 * - quantityBilled === 0 — the ONLY value Lump Sum, MLMP, and Amount Based
 *   ever send (none of them bill by quantity at all — LumpSumInvoiceWorkspaceModal.tsx,
 *   MlmpInvoiceWorkspaceModal.tsx, and AmountBasedInvoiceWorkspaceModal.tsx
 *   each build their line with calculatedAmountINR equal to the invoice
 *   amount itself and commercialAdjustmentINR: 0). There is no separate
 *   "system amount" to compare against for these methods.
 *
 * quantityBilled is the one signal already on InvoiceLine that reliably
 * distinguishes the two cases — confirmed empirically, not assumed: every
 * quantity-driven creation path sends a real qty > 0, every flat/milestone-
 * value method always sends exactly 0. The invoice method itself is never
 * stored on InvoiceLine (see schema.prisma) and does not need to be.
 */
function computeAmounts(params: {
  quantityBilled: number;
  unitPriceINR: number;
  milestonePercent: number;
  invoiceAmountINR: number;
}): { calculatedAmountINR: number; commercialAdjustmentINR: number } {
  if (params.quantityBilled > 0) {
    const calculatedAmountINR = round(params.quantityBilled * params.unitPriceINR * (params.milestonePercent / 100));
    return { calculatedAmountINR, commercialAdjustmentINR: round(params.invoiceAmountINR - calculatedAmountINR) };
  }
  return { calculatedAmountINR: params.invoiceAmountINR, commercialAdjustmentINR: 0 };
}

/**
 * Rejects a line that would double-bill a Payment Milestone — see
 * findConflictingLineForMilestone()'s own comment in invoice.repository.ts
 * for the full scoping rationale (project-wide per milestoneId for Lump
 * Sum, per (quantityItemId, setIndex, milestoneId) for MLMP). Callers only
 * invoke this when quantityBilled === 0 and a milestoneId is present —
 * Invoice Line Items' Commercial Milestone Billing mode (quantityBilled > 0)
 * is deliberately exempt, since it legitimately re-bills the same milestone
 * multiple times bounded by a quantity ceiling, not a one-shot lock.
 */
async function assertNoDuplicateMilestoneBilling(params: {
  milestoneId: string;
  invoiceNo: string;
  setIndex: number | null;
  quantityItemId: string;
  excludeLineId?: string;
}): Promise<void> {
  const conflict = await findConflictingLineForMilestone(params);
  if (conflict) {
    throw new AppError(
      `This payment milestone has already been invoiced under a different invoice cycle (${conflict.invoiceNo}).`,
      409
    );
  }
}

export async function createInvoiceLineForQuantityItem(
  quantityItemId: string,
  input: CreateInvoiceLineInput,
  user: AccessTokenPayload
): Promise<InvoiceLineDto> {
  const quantityItem = await getQuantityItemById(quantityItemId);
  await assertProjectAccessById(quantityItem.projectId, user);
  const milestonePercent = await resolveMilestonePercent(input.milestoneId);

  if (input.milestoneId && input.quantityBilled === 0) {
    await assertNoDuplicateMilestoneBilling({
      milestoneId: input.milestoneId,
      invoiceNo: input.invoiceNo,
      setIndex: input.setIndex ?? null,
      quantityItemId,
    });
  }

  const unitPriceINR = quantityItem.unitRateINR;
  const { calculatedAmountINR, commercialAdjustmentINR } = computeAmounts({
    quantityBilled: input.quantityBilled,
    unitPriceINR,
    milestonePercent,
    invoiceAmountINR: input.invoiceAmountINR,
  });

  const data: InvoiceLineData = {
    invoiceNo: input.invoiceNo,
    invoiceDate: input.invoiceDate,
    milestoneId: input.milestoneId ?? null,
    milestoneName: input.milestoneName ?? null,
    setIndex: input.setIndex ?? null,
    description: input.description ?? null,
    quantityBilled: input.quantityBilled,
    unitPriceINR,
    calculatedAmountINR,
    invoiceAmountINR: input.invoiceAmountINR,
    commercialAdjustmentINR,
    clientReference: input.clientReference ?? null,
    remarks: input.remarks ?? null,
    status: input.status,
    createdBy: input.createdBy,
  };

  const created = await createLineInRepository(quantityItemId, data);

  // Priority #6 Phase 3B — only when the newly created line is NOT Draft
  // (a plain Draft creation is a workspace edit, not a billing event worth
  // surfacing). Fire-and-forget; never affects the create response.
  if (created.status !== "Draft") {
    await notifyInvoiceStatusEvent(quantityItem.projectId, created.invoiceNo, `was created as ${created.status}.`);
  }

  return toInvoiceLineDto(created);
}

/**
 * quantityItemId is never editable via PATCH (identity, frozen at
 * creation) — a line's parent QuantityItem never changes; raising it
 * against a different activity means creating a new line instead.
 * calculatedAmountINR/commercialAdjustmentINR are only recomputed when a
 * field they actually depend on changes — a status-only PATCH (e.g.
 * Draft -> Paid from Invoice History) must not silently rewrite historical
 * amounts using today's Quantity rate.
 */
export async function updateInvoiceLine(
  id: string,
  input: UpdateInvoiceLineInput,
  user: AccessTokenPayload
): Promise<InvoiceLineDto> {
  const existing = await getLineById(id);
  if (!existing) {
    throw new AppError("Invoice line not found.", 404);
  }
  // Unconditional (not gated by needsRecompute below) — an authorization
  // check must run on every mutation, not only the ones that happen to also
  // recompute pricing. Reused by the recompute branch further down so this
  // never fetches the QuantityItem twice.
  const parentQuantityItem = await getQuantityItemById(existing.quantityItemId);
  await assertProjectAccessById(parentQuantityItem.projectId, user);

  const needsRecompute =
    input.quantityBilled !== undefined || input.invoiceAmountINR !== undefined || input.milestoneId !== undefined;

  // Duplicate-milestone-billing guard — only re-checked when a field that
  // could newly create a conflict is actually changing (milestoneId,
  // invoiceNo, or setIndex), and only meaningful for the merged result if
  // it's still a flat/milestone-value line (quantityBilled === 0) with a
  // real milestoneId. See assertNoDuplicateMilestoneBilling()'s comment.
  const milestoneFieldsChanging =
    input.milestoneId !== undefined || input.invoiceNo !== undefined || input.setIndex !== undefined;
  if (milestoneFieldsChanging) {
    const mergedMilestoneId = input.milestoneId !== undefined ? input.milestoneId : existing.milestoneId;
    const mergedQuantityBilled = input.quantityBilled ?? existing.quantityBilled;
    if (mergedMilestoneId && mergedQuantityBilled === 0) {
      await assertNoDuplicateMilestoneBilling({
        milestoneId: mergedMilestoneId,
        invoiceNo: input.invoiceNo ?? existing.invoiceNo,
        setIndex: input.setIndex !== undefined ? input.setIndex : existing.setIndex,
        quantityItemId: existing.quantityItemId,
        excludeLineId: id,
      });
    }
  }

  let unitPriceINR = existing.unitPriceINR;
  let calculatedAmountINR = existing.calculatedAmountINR;
  let commercialAdjustmentINR = existing.commercialAdjustmentINR;

  if (needsRecompute) {
    const quantityBilled = input.quantityBilled ?? existing.quantityBilled;
    const invoiceAmountINR = input.invoiceAmountINR ?? existing.invoiceAmountINR;
    const milestoneId = input.milestoneId !== undefined ? input.milestoneId : existing.milestoneId;

    const milestonePercent = await resolveMilestonePercent(milestoneId);

    unitPriceINR = parentQuantityItem.unitRateINR;
    ({ calculatedAmountINR, commercialAdjustmentINR } = computeAmounts({
      quantityBilled,
      unitPriceINR,
      milestonePercent,
      invoiceAmountINR,
    }));
  }

  const updated = await updateLineInRepository(id, {
    ...(input.invoiceNo !== undefined && { invoiceNo: input.invoiceNo }),
    ...(input.invoiceDate !== undefined && { invoiceDate: input.invoiceDate }),
    ...(input.milestoneId !== undefined && { milestoneId: input.milestoneId }),
    ...(input.milestoneName !== undefined && { milestoneName: input.milestoneName }),
    ...(input.setIndex !== undefined && { setIndex: input.setIndex }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.quantityBilled !== undefined && { quantityBilled: input.quantityBilled }),
    ...(input.invoiceAmountINR !== undefined && { invoiceAmountINR: input.invoiceAmountINR }),
    ...(input.clientReference !== undefined && { clientReference: input.clientReference }),
    ...(input.remarks !== undefined && { remarks: input.remarks }),
    ...(input.status !== undefined && { status: input.status }),
    ...(needsRecompute && { unitPriceINR, calculatedAmountINR, commercialAdjustmentINR }),
  });

  // Priority #6 Phase 3B — only a REAL status transition (oldStatus !==
  // newStatus) notifies. A PATCH that doesn't touch status, or one that
  // "changes" it to the same value it already was, never does. Different
  // legitimate transitions (Draft->Raised, Raised->PartiallyPaid, ...) each
  // notify independently — this check is on the actual before/after values
  // every time, not a one-shot "has this ever transitioned" flag, so no
  // schema change is needed for correct idempotency here.
  if (input.status !== undefined && input.status !== existing.status) {
    await notifyInvoiceStatusEvent(
      parentQuantityItem.projectId,
      updated.invoiceNo,
      `status changed from ${existing.status} to ${updated.status}.`
    );
  }

  return toInvoiceLineDto(updated);
}

/**
 * Hard delete — used only when the Raise Invoice UI itself removes a line
 * that was never really "raised" yet (a workspace row unchecked, or a
 * quantity cleared back to 0, before the user ever saved it as a real
 * invoice) — the frontend's own upsert-or-remove logic decides when this
 * applies, exactly mirroring Quantity's own DELETE /quantity/:id. This is
 * NOT how an already-raised invoice is undone; that is a status change to
 * "Cancelled" via PATCH (see updateInvoiceLine()), which preserves history
 * instead of erasing it.
 */
export async function deleteInvoiceLine(id: string, user: AccessTokenPayload): Promise<void> {
  const existing = await getLineById(id);
  if (!existing) {
    throw new AppError("Invoice line not found.", 404);
  }
  const parentQuantityItem = await getQuantityItemById(existing.quantityItemId);
  await assertProjectAccessById(parentQuantityItem.projectId, user);

  await deleteLineInRepository(id);
}

/**
 * The frontend's "InvoiceItem" shape, derived at read time — one entry per
 * QuantityItem belonging to this project, each carrying every InvoiceLine
 * raised against it. There is no separate InvoiceItem table to query;
 * listQuantityForProject() (which itself validates the project exists) is
 * the source of the id/description/qty/uom/unitPrice/totalPrice fields.
 */
export async function listInvoiceItemsForProject(
  projectId: string,
  user: AccessTokenPayload
): Promise<InvoiceItemListDto> {
  const quantityResult = await listQuantityForProject(projectId, user);
  const quantityItems = quantityResult.items;

  const lines = await getLinesByQuantityItemIds(quantityItems.map((q) => q.id));
  const linesByQuantityItemId = new Map<string, InvoiceLineRow[]>();
  for (const line of lines) {
    const bucket = linesByQuantityItemId.get(line.quantityItemId);
    if (bucket) {
      bucket.push(line);
    } else {
      linesByQuantityItemId.set(line.quantityItemId, [line]);
    }
  }

  const items: InvoiceItemDto[] = quantityItems.map((quantityItem) => ({
    id: quantityItem.id,
    description: quantityItem.description,
    qty: quantityItem.woQty,
    uom: quantityItem.uom || "DAY",
    unitPrice: quantityItem.unitRateINR,
    totalPrice: quantityItem.woValue,
    invoices: (linesByQuantityItemId.get(quantityItem.id) ?? []).map((row) => toInvoiceLineDto(row)),
  }));

  return { items };
}

/**
 * Bounded, self-healing wrapper around createLinesWithIds() for the one
 * race a plain existence-check-then-insert can't close — mirrors
 * milestone.service.ts's createMilestonesWithIdsSafely() exactly (same
 * retry-once-then-409 shape, same "recheck, classify, merge, retry only
 * what's still missing" resolution).
 */
async function createLinesWithIdsSafely(
  rows: IngestLineRow[],
  existingById: Map<string, InvoiceLineRow>,
  attempt = 1
): Promise<InvoiceLineRow[]> {
  if (rows.length === 0) {
    return [];
  }

  try {
    return await createLinesWithIds(
      rows.map((row) => ({
        id: row.id,
        quantityItemId: row.quantityItemId,
        invoiceNo: row.invoiceNo,
        invoiceDate: row.invoiceDate,
        milestoneId: row.milestoneId ?? null,
        milestoneName: row.milestoneName ?? null,
        setIndex: row.setIndex ?? null,
        description: row.description ?? null,
        quantityBilled: row.quantityBilled,
        unitPriceINR: row.unitPriceINR ?? null,
        calculatedAmountINR: row.calculatedAmountINR ?? null,
        invoiceAmountINR: row.invoiceAmountINR,
        commercialAdjustmentINR: row.commercialAdjustmentINR ?? null,
        clientReference: row.clientReference ?? null,
        remarks: row.remarks ?? null,
        status: row.status,
        createdBy: row.createdBy,
      }))
    );
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
    if (attempt >= 2) {
      throw new AppError(
        "Invoice line ingest hit a concurrent write conflict twice in a row. Please retry the request.",
        409
      );
    }

    const recheck = await getLinesByIds(rows.map((row) => row.id));
    const recheckById = new Map(recheck.map((row) => [row.id, row]));

    const nowConflicting = rows.filter((row) => {
      const found = recheckById.get(row.id);
      return found && !lineMatchesPayload(found, row);
    });
    if (nowConflicting.length > 0) {
      const idsList = nowConflicting.map((c) => `"${c.id}"`).join(", ");
      throw new AppError(
        `Invoice Line ID(s) ${idsList} were concurrently created with different data. Ingest never overwrites an existing invoice line — update it via PATCH /invoice-lines/:id instead.`,
        409
      );
    }

    recheckById.forEach((row, id) => existingById.set(id, row));
    const stillMissing = rows.filter((row) => !recheckById.has(row.id));

    return createLinesWithIdsSafely(stillMissing, existingById, attempt + 1);
  }
}

/**
 * Ingest — the ONLY path that accepts and persists a caller-supplied `id`
 * and raw historical snapshot values (unitPriceINR/calculatedAmountINR/
 * commercialAdjustmentINR), never recomputed here. Used exclusively by the
 * legacy-migration step, never by the ordinary "Raise Invoice" UI action.
 * Mirrors milestone.service.ts's ingestMilestonesForProject() almost
 * exactly; the one addition is validating that every referenced
 * quantityItemId actually belongs to an already-migrated QuantityItem for
 * this project — enforcing the confirmed migration ordering (Quantity must
 * be migrated before Invoice for the same project).
 */
export async function ingestInvoiceLinesForProject(
  projectId: string,
  input: IngestInvoiceLinesInput,
  user: AccessTokenPayload
): Promise<IngestInvoiceLinesResultDto> {
  await assertProjectAccessById(projectId, user);

  const quantityResult = await listQuantityForProject(projectId, user);
  const validQuantityItemIds = new Set(quantityResult.items.map((q) => q.id));

  const foreignQuantityItem = input.lines.find((line) => !validQuantityItemIds.has(line.quantityItemId));
  if (foreignQuantityItem) {
    throw new AppError(
      `Quantity Item ID "${foreignQuantityItem.quantityItemId}" does not belong to this project (or Quantity has not been migrated for it yet).`,
      409
    );
  }

  const ids = input.lines.map((line) => line.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new AppError(`Duplicate Invoice Line ID "${id}" within the ingest batch.`, 409);
    }
    seen.add(id);
  }

  const existing = await getLinesByIds(ids);
  const existingById = new Map(existing.map((row) => [row.id, row]));

  const conflicts = input.lines.filter((line) => {
    const existingRow = existingById.get(line.id);
    return existingRow && !lineMatchesPayload(existingRow, line);
  });
  if (conflicts.length > 0) {
    const idsList = conflicts.map((c) => `"${c.id}"`).join(", ");
    throw new AppError(
      `Invoice Line ID(s) ${idsList} already exist with different data than supplied. Ingest never overwrites an existing invoice line — update it via PATCH /invoice-lines/:id instead.`,
      409
    );
  }

  const rowsToCreate = input.lines.filter((line) => !existingById.has(line.id));

  const created = await createLinesWithIdsSafely(rowsToCreate, existingById);
  const createdById = new Map(created.map((row) => [row.id, row]));

  const items = input.lines.map((line) => {
    const row = existingById.get(line.id) ?? createdById.get(line.id);
    if (!row) {
      throw new AppError(`Invoice Line with ID "${line.id}" was not created.`, 500);
    }
    return toInvoiceLineDto(row);
  });

  return { items };
}
