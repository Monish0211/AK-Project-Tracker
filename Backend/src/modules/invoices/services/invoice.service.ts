import { Prisma } from "../../../../generated/prisma/client.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import {
  assertProjectAccess,
  assertProjectAccessById,
  getProjectCreatorUserId,
  hasUnrestrictedProjectVisibility,
} from "../../../shared/utils/projectAccess.js";
import { getUserDisplayName } from "../../../shared/utils/userDisplayName.js";
import { userHasApprovalPermission } from "../../../shared/middleware/requireApprovalPermission.js";
import { sendEmail } from "../../../shared/email/email.service.js";
import { buildInvoiceSharedEmail } from "../../../shared/email/templates/invoiceShared.template.js";
import { notify, resolveProjectEventRecipients } from "../../notifications/notification.service.js";
import { fulfillOpenInvoiceRequestsForProject, notifyInvoicePaidIfLinked } from "../../invoiceRequests/services/invoiceRequest.service.js";
import { isGenuinePaidTransition } from "../../invoiceRequests/invoiceRequestEmail.rules.js";
import { findProjectByIdAny } from "../../projects/repository/project.repository.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { getMilestonePercentageById } from "../../milestones/services/milestone.service.js";
import { getQuantityItemById, listQuantityForProject } from "../../quantity/services/quantity.service.js";
// Sept 2026 — Reports/Dashboard Invoice Raised discrepancy fix. Reuses the
// EXACT SAME authorized-project lookup and InvoiceLine query the
// Dashboard's own Invoice Raised KPI already uses
// (dashboard.service.ts's getDashboardSummary()) — never a second,
// independently-drifting invoice aggregation. See
// listAllInvoiceLinesForCaller() below.
import { findAuthorizedProjects, findInvoiceLinesForProjects } from "../../dashboard/repository/dashboard.repository.js";
import type { InvoiceLineRow as DashboardInvoiceLineRow } from "../../dashboard/repository/dashboard.repository.js";
import type {
  IngestInvoiceLinesResultDto,
  InvoiceItemDto,
  InvoiceItemListDto,
  InvoiceLineDto,
  ReportInvoiceLineListDto,
} from "../dto/invoice.dto.js";
import type { InvoiceLineData } from "../invoice.types.js";
import {
  createLine as createLineInRepository,
  createLinesWithIds,
  deleteLine as deleteLineInRepository,
  findActiveUsersByIds,
  findConflictingLineForMilestone,
  findFirstNonDraftLineCurrencyForProject,
  findInvoiceSiblingWithDifferentCurrency,
  findProjectInvoiceCurrency,
  clearProjectInvoiceCurrencyIfNoGenuineLines,
  findInvoiceNumber,
  insertInvoiceNumber,
  lockInvoiceNumber,
  releaseInvoiceNumberIfUnused,
  getLineById,
  getLinesByIds,
  getLinesByQuantityItemIds,
  setProjectInvoiceCurrencyIfUnset,
  sumInvoicedAmountForQuantityItem,
  updateLine as updateLineInRepository,
} from "../repository/invoice.repository.js";
import type {
  CreateInvoiceLineInput,
  IngestInvoiceLinesInput,
  SendInvoiceLineToInput,
  UpdateInvoiceLineInput,
} from "../validators/invoice.validators.js";
import { env } from "../../../shared/utils/env.js";
import {
  evaluateCurrencyLock,
  normalizeCurrency,
  resolveCreateAmounts,
  resolveEffectiveLock,
  resolveUpdateAmounts,
} from "../invoiceCurrency.rules.js";

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
 * Invoice numbers carry no business length limit (confirmed Oct 2026 — they
 * must match Tally exactly). The only ceiling is physical: Postgres cannot
 * index a value over ~2.7 KB (SQLSTATE 54000), so such a number gets a clear
 * 400 instead of a generic 500. Nothing is written — the whole transaction
 * rolls back.
 */
async function insertInvoiceNumberOrReject(invoiceNo: string, projectId: string, tx: Prisma.TransactionClient): Promise<boolean> {
  try {
    return await insertInvoiceNumber(invoiceNo, projectId, tx);
  } catch (error) {
    const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } })?.meta?.driverAdapterError?.cause;
    if (error instanceof Prisma.PrismaClientKnownRequestError && cause?.originalCode === "54000") {
      throw new AppError("This Invoice Number is too long for the database to store. Check it against Tally.", 400);
    }
    throw error;
  }
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
    currency: row.currency,
    exchangeRateToINR: row.exchangeRateToINR,
    invoiceAmountOriginal: row.invoiceAmountOriginal,
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
 *
 * P13 — optional `tx`: when a milestoneId is supplied, the caller must pass
 * its own advisory-locked transaction (see lockProjectForMilestoneRead()
 * below) so this existence read can never race a concurrent milestone
 * delete for the same project.
 */
async function resolveMilestonePercent(milestoneId: string | null | undefined, tx?: Prisma.TransactionClient): Promise<number> {
  if (!milestoneId) {
    return 100;
  }
  const percent = await getMilestonePercentageById(milestoneId, tx);
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
 *
 * P3 — `tx` is now required (not optional) so this can never accidentally
 * run outside the advisory-locked transaction its callers set up — the
 * whole point of this fix is that the read and the eventual write are never
 * allowed to straddle two separate, unguarded round trips again.
 */
async function assertNoDuplicateMilestoneBilling(
  tx: Prisma.TransactionClient,
  params: {
    milestoneId: string;
    invoiceNo: string;
    setIndex: number | null;
    quantityItemId: string;
    excludeLineId?: string;
  }
): Promise<void> {
  const conflict = await findConflictingLineForMilestone(params, tx);
  if (conflict) {
    throw new AppError(
      `This payment milestone has already been invoiced under a different invoice cycle (${conflict.invoiceNo}).`,
      409
    );
  }
}

/**
 * P2 — the authoritative "may this legally be invoiced" rule: the
 * cumulative non-Cancelled invoiceAmountINR already raised against a
 * QuantityItem, plus this new/updated line's own amount, may never exceed
 * that QuantityItem's own Work Order Value (woValue) — the contractual
 * ceiling for that activity. Previously nothing enforced this at write
 * time; the Dashboard's Math.min() cap (dashboard.formulas.ts) only ever
 * clamped what was DISPLAYED, never what could be WRITTEN — a client could
 * (and, per the pre-existing invoice.ingestAuth.http.test.ts, already did in
 * a test) submit an invoiceAmountINR many times the activity's real value
 * and have it persist unmodified.
 *
 * `tx` is required for the same reason as assertNoDuplicateMilestoneBilling
 * above — the sum must be read inside the same advisory-locked transaction
 * as the write, or two concurrent requests could both read the same
 * pre-race total and both pass.
 *
 * Deliberately NOT applied to ingestInvoiceLinesForProject() — mirrors the
 * exact same, already-documented exemption for milestone ingest
 * (milestone.service.ts's ingestMilestonesForProject()): historical/legacy
 * invoice data being migrated in may not cleanly fit today's cap (real
 * commercial adjustments, contract variations, or already-over-value
 * historical billing predating this rule), and rejecting a whole legacy
 * batch over that would break migration. This is flagged as a decision
 * needing business confirmation, not silently assumed — see the final
 * report's Remaining Decisions section.
 */
async function assertInvoiceAmountWithinLimit(
  tx: Prisma.TransactionClient,
  quantityItemId: string,
  woValueINR: number,
  incomingAmountINR: number,
  excludeLineId?: string
): Promise<void> {
  const alreadyInvoiced = await sumInvoicedAmountForQuantityItem(quantityItemId, excludeLineId, tx);
  const newTotal = round(alreadyInvoiced + incomingAmountINR);
  if (newTotal > woValueINR) {
    throw new AppError(
      `This activity would be invoiced ₹${newTotal.toLocaleString("en-IN")}, exceeding its Work Order Value of ₹${woValueINR.toLocaleString("en-IN")}. Already invoiced: ₹${alreadyInvoiced.toLocaleString("en-IN")}.`,
      400
    );
  }
}

/** Acquire the QuantityItem-scoped advisory lock for the P2 cumulative-amount check — same hashtext()-keyed pattern as milestone.service.ts's lockProjectForMilestoneWrite(). Must be the first statement inside the transaction. */
async function lockQuantityItemForInvoiceWrite(tx: Prisma.TransactionClient, quantityItemId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${quantityItemId}))`;
}

/**
 * Acquire the milestone-dedup-scoped advisory lock for the P3 check —
 * mirrors findConflictingLineForMilestone()'s own two scoping rules exactly
 * (project-wide per milestoneId for Lump Sum, per
 * (quantityItemId, setIndex, milestoneId) for MLMP), hashed into a single
 * text key since pg_advisory_xact_lock(hashtext(...)) takes one argument.
 * Distinct from lockQuantityItemForInvoiceWrite()'s lock — always acquired
 * SECOND, after the QuantityItem lock, so every code path takes both locks
 * in the same fixed order and two concurrent requests can never deadlock by
 * acquiring them in opposite orders.
 */
async function lockMilestoneBillingForInvoiceWrite(
  tx: Prisma.TransactionClient,
  params: { milestoneId: string; setIndex: number | null; quantityItemId: string }
): Promise<void> {
  const lockKey =
    params.setIndex !== null
      ? `mlmp:${params.quantityItemId}:${params.setIndex}:${params.milestoneId}`
      : `lumpsum:${params.milestoneId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}

/**
 * P13 — the SAME lock key milestone.service.ts's lockProjectForMilestoneWrite()
 * uses (`pg_advisory_xact_lock(hashtext(projectId))`), taken here whenever
 * an invoice line references a milestoneId at all (create, or an update
 * that touches milestone-related fields) — this is what actually closes
 * the milestone-delete-vs-invoice-create race: both sides now contend for
 * the identical lock, so a concurrent deleteMilestoneItem() for this same
 * project can never commit in the gap between this transaction's
 * milestone-existence read and its eventual write. Acquired THIRD in this
 * file's fixed lock order (QuantityItem, then Project, then
 * milestone-billing-dedup) — see this file's other two lock helpers for why
 * a fixed order matters.
 */
async function lockProjectForMilestoneRead(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
}

/**
 * Invoice Currency feature (Oct 2026) — enforce, inside the caller's
 * transaction, (1) the project-wide invoice-currency lock and (2) the
 * per-invoice rule that every line sharing an invoiceNo has the same
 * currency and rate, then persist the lock if this write establishes it.
 * See invoiceCurrency.rules.ts for the business rules themselves.
 *
 * Serialized by its OWN advisory key ("invoice-currency:<projectId>"), not
 * the bare projectId key milestones/reminders/invoice requests share, and
 * always acquired LAST in this file's lock order — the holder of this lock
 * never waits on any other lock, so it can't take part in a deadlock. Two
 * concurrent first-raises of conflicting currencies on different
 * QuantityItems of one project both reach this point; whichever acquires it
 * second sees the first one's committed lock (or its non-Draft line) and is
 * rejected with 409.
 */
async function enforceInvoiceCurrencyRules(
  tx: Prisma.TransactionClient,
  params: {
    projectId: string;
    invoiceNo: string;
    currency: string;
    exchangeRateToINR: number;
    targetStatus: string;
    excludeLineId?: string | undefined;
  }
): Promise<void> {
  const lockKey = `invoice-currency:${params.projectId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const lineCurrency = normalizeCurrency(params.currency);
  const project = await findProjectInvoiceCurrency(params.projectId, tx);
  const persistedLock = project?.invoiceCurrency ?? null;
  const inferred = persistedLock ? null : await findFirstNonDraftLineCurrencyForProject(params.projectId, tx);
  const effectiveLock = resolveEffectiveLock(persistedLock, inferred ? [inferred.currency] : []);

  const { persistLock } = evaluateCurrencyLock({
    effectiveLock,
    persistedLock,
    lineCurrency,
    targetStatus: params.targetStatus,
  });

  const sibling = await findInvoiceSiblingWithDifferentCurrency(
    {
      projectId: params.projectId,
      invoiceNo: params.invoiceNo,
      currency: lineCurrency,
      exchangeRateToINR: params.exchangeRateToINR,
      excludeLineId: params.excludeLineId,
    },
    tx
  );
  if (sibling) {
    throw new AppError(
      `Invoice ${params.invoiceNo} already has lines in ${sibling.currency} at rate ${sibling.exchangeRateToINR}. Every line of one invoice must use the same currency and exchange rate.`,
      409
    );
  }

  if (persistLock) {
    await setProjectInvoiceCurrencyIfUnset(params.projectId, persistLock, tx);
  }
}

/**
 * Manual invoice numbering (Oct 2026) — confirmed rules: the user enters
 * their Tally invoice number; a number is unique across the WHOLE portal,
 * compared ignoring letter case and outer whitespace, stored exactly as
 * entered. One invoice = several lines sharing a number, all in one
 * project. See schema.prisma's InvoiceNumber.
 *
 * `intent` says what the caller means:
 * - "new": this line STARTS a new invoice — the number must not be in use
 *   anywhere (any project, any status, Cancelled included). A new invoice
 *   can therefore never reopen, overwrite or merge into an existing one.
 * - "existing": this line joins an invoice this project already has.
 * - undefined (callers that predate manual numbering): joins this
 *   project's invoice if it exists, otherwise registers the number —
 *   exactly how such callers behaved before — but a number owned by
 *   another project is still rejected.
 * Must run inside the caller's transaction, after its QuantityItem lock;
 * takes the per-number lock itself (before the currency lock).
 */
async function registerInvoiceNumberForLine(
  tx: Prisma.TransactionClient,
  params: { projectId: string; invoiceNo: string; intent: "new" | "existing" | undefined }
): Promise<void> {
  const { projectId, invoiceNo, intent } = params;
  await lockInvoiceNumber(invoiceNo, tx);
  const registered = await findInvoiceNumber(invoiceNo, tx);

  if (intent === "new") {
    if (registered || !(await insertInvoiceNumberOrReject(invoiceNo, projectId, tx))) {
      throw new AppError(
        `Invoice number "${invoiceNo}" is already used by another invoice. Enter the invoice number exactly as issued in Tally.`,
        409
      );
    }
    return;
  }

  if (registered) {
    if (registered.projectId !== projectId) {
      throw new AppError(`Invoice number "${invoiceNo}" is already used by another invoice.`, 409);
    }
    if (registered.invoiceNo !== invoiceNo) {
      throw new AppError(
        `"${invoiceNo}" differs only in letter case or spacing from this project's existing invoice "${registered.invoiceNo}". Use the exact number.`,
        409
      );
    }
    return;
  }

  if (intent === "existing") {
    throw new AppError(
      `Invoice "${invoiceNo}" no longer exists in this project (it may have been deleted). Start a new invoice instead.`,
      409
    );
  }
  if (!(await insertInvoiceNumberOrReject(invoiceNo, projectId, tx))) {
    throw new AppError(`Invoice number "${invoiceNo}" is already used by another invoice.`, 409);
  }
}

/**
 * GET /projects/:projectId/invoice-numbers/availability — lets the Raise
 * Invoice form reject a duplicate BEFORE it closes, so the user's typed
 * number is kept. The create path remains the authority (a number can still
 * be taken between this check and the save). Reveals only whether the
 * number is free — never which project uses it.
 */
export async function checkInvoiceNumberAvailability(
  projectId: string,
  invoiceNo: string,
  user: AccessTokenPayload
): Promise<{ invoiceNo: string; available: boolean; usedInThisProject: boolean }> {
  await assertProjectAccessById(projectId, user);
  const trimmed = invoiceNo.trim();
  if (!trimmed) {
    throw new AppError("Invoice Number is required.", 400);
  }
  const registered = await findInvoiceNumber(trimmed);
  return { invoiceNo: trimmed, available: !registered, usedInThisProject: registered?.projectId === projectId };
}

export async function createInvoiceLineForQuantityItem(
  quantityItemId: string,
  input: CreateInvoiceLineInput,
  user: AccessTokenPayload
): Promise<InvoiceLineDto> {
  const quantityItem = await getQuantityItemById(quantityItemId);
  await assertProjectAccessById(quantityItem.projectId, user);

  // Never trusts a client-supplied name — always the current fullName for
  // the authenticated caller, so a line can never be attributed to someone
  // else. No DB write depends on concurrent sibling state, so this is safe
  // to resolve outside the locked transaction below.
  const createdBy = await getUserDisplayName(user.sub);

  // Invoice Currency feature (Oct 2026) — pure validation, before any lock
  // is taken: a request without currency fields resolves to INR with the
  // INR amount unchanged; a non-INR request has its INR equivalent derived here
  // (never trusted from the client). See invoiceCurrency.rules.ts.
  const amounts = resolveCreateAmounts(input);

  // P2/P3/P13 — lock, re-check (milestone existence, financial ceiling,
  // then duplicate-milestone-billing), and write, all inside one
  // transaction, so no concurrent create/update against this same
  // QuantityItem, this same Project's milestones, or this same milestone
  // billing cycle can interleave with any of these checks. Milestone-
  // percent resolution moves INSIDE the transaction (it used to run before
  // it) specifically so the "does this milestone still exist" read happens
  // under the same lock a concurrent deleteMilestoneItem() also takes —
  // see lockProjectForMilestoneRead()'s own comment. Locks are always
  // taken in the same fixed order (QuantityItem, then Project, then
  // milestone-billing-dedup) across every call site in this file — see
  // each lock helper's own comment for why that ordering matters.
  const created = await prisma.$transaction(
    async (tx) => {
      await lockQuantityItemForInvoiceWrite(tx, quantityItemId);
      await assertInvoiceAmountWithinLimit(tx, quantityItemId, quantityItem.woValue, amounts.invoiceAmountINR);

      if (input.milestoneId) {
        await lockProjectForMilestoneRead(tx, quantityItem.projectId);
      }
      const milestonePercent = await resolveMilestonePercent(input.milestoneId, tx);

      const unitPriceINR = quantityItem.unitRateINR;
      const { calculatedAmountINR, commercialAdjustmentINR } = computeAmounts({
        quantityBilled: input.quantityBilled,
        unitPriceINR,
        milestonePercent,
        invoiceAmountINR: amounts.invoiceAmountINR,
      });

      if (input.milestoneId && input.quantityBilled === 0) {
        await lockMilestoneBillingForInvoiceWrite(tx, {
          milestoneId: input.milestoneId,
          setIndex: input.setIndex ?? null,
          quantityItemId,
        });
        await assertNoDuplicateMilestoneBilling(tx, {
          milestoneId: input.milestoneId,
          invoiceNo: input.invoiceNo,
          setIndex: input.setIndex ?? null,
          quantityItemId,
        });
      }

      await registerInvoiceNumberForLine(tx, {
        projectId: quantityItem.projectId,
        invoiceNo: input.invoiceNo,
        intent: input.invoiceIntent,
      });

      await enforceInvoiceCurrencyRules(tx, {
        projectId: quantityItem.projectId,
        invoiceNo: input.invoiceNo,
        currency: amounts.currency,
        exchangeRateToINR: amounts.exchangeRateToINR,
        targetStatus: input.status,
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
        invoiceAmountINR: amounts.invoiceAmountINR,
        commercialAdjustmentINR,
        // Invoice Currency feature (Oct 2026) — a caller that sends no
        // currency fields gets currency="INR", exchangeRateToINR=1 and
        // invoiceAmountOriginal equal to the INR amount, exactly as before.
        currency: amounts.currency,
        exchangeRateToINR: amounts.exchangeRateToINR,
        invoiceAmountOriginal: amounts.invoiceAmountOriginal,
        clientReference: input.clientReference ?? null,
        remarks: input.remarks ?? null,
        status: input.status,
        createdBy,
      };

      return createLineInRepository(quantityItemId, data, tx);
    },
    // Same headroom reasoning as milestone.service.ts's createMilestoneForProject()
    // — this transaction can now block behind a slower concurrent write for
    // the same QuantityItem/Project/milestone, so it needs more than
    // Prisma's 5000ms default.
    { timeout: 30_000, maxWait: 10_000 }
  );

  // Priority #6 Phase 3B — only when the newly created line is NOT Draft
  // (a plain Draft creation is a workspace edit, not a billing event worth
  // surfacing). Fire-and-forget; never affects the create response.
  if (created.status !== "Draft") {
    await notifyInvoiceStatusEvent(quantityItem.projectId, created.invoiceNo, `was created as ${created.status}.`);
  }

  // Request Invoice workflow (Sept 2026) — Section B. Only a genuine
  // "Raised" outcome fulfills an Open Invoice Request for this project
  // (never Draft, never Cancelled). Fire-and-forget — never affects the
  // create response, and a failure here must never be mistaken for the
  // invoice line itself failing to save (it has already committed above).
  if (created.status === "Raised") {
    void fulfillOpenInvoiceRequestsForProject(quantityItem.projectId, created.id).catch((error) => {
      console.error("[invoices] fulfillOpenInvoiceRequestsForProject failed:", error instanceof Error ? error.message : error);
    });
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

  // Request Invoice workflow (Sept 2026) — bypass fix (spec point 17). The
  // literal "Raise Invoice" action is gated only on the CREATE route (POST
  // /quantity/:quantityItemId/invoice-lines — see invoice.routes.ts).
  // Without this check, any Invoices-module user could still "raise" an
  // invoice by PATCHing an existing Draft line's status to "Raised," since
  // this route otherwise has no Raise Invoice gate at all. Only THIS
  // specific transition (status actually changing TO "Raised" from
  // something else) requires the permission; every other legitimate PATCH
  // use — amount/date/description edits, Draft-to-Draft edits, and every
  // other status transition (Raised -> PartiallyPaid/Paid/Cancelled from
  // Invoice History) — is unaffected.
  const isRaisingTransition = input.status === "Raised" && existing.status !== "Raised";
  if (isRaisingTransition && !(await userHasApprovalPermission(user.sub, ["Raise Invoice"]))) {
    throw new AppError("You do not have permission to raise this invoice.", 403);
  }

  // Invoice Currency feature (Oct 2026) — the amount fields this PATCH
  // should actually write (empty when amounts aren't changing). For an INR
  // line this is exactly input.invoiceAmountINR (plus invoiceAmountOriginal
  // kept equal to it); for a non-INR line the INR equivalent is re-derived from
  // invoiceAmountOriginal x the line's own recorded rate. Throws on any
  // attempt to change the frozen currency/rate. See invoiceCurrency.rules.ts.
  const amountChange = resolveUpdateAmounts(existing, input);

  const needsRecompute =
    input.quantityBilled !== undefined || amountChange.invoiceAmountINR !== undefined || input.milestoneId !== undefined;

  // Re-check the currency lock only when this PATCH could newly conflict
  // with it: a status change (e.g. a Draft in a now-locked-out currency
  // being raised) or a move to a different invoiceNo.
  const nextStatus = input.status ?? existing.status;
  // Manual invoice numbering — the frontend re-sends the (trimmed) number on
  // every PATCH; only a genuinely different number counts as a change, so a
  // historical number with stray outer whitespace is never rewritten or
  // rejected by an unrelated edit.
  const invoiceNoChanging = input.invoiceNo !== undefined && input.invoiceNo !== existing.invoiceNo.trim();
  const nextInvoiceNo = invoiceNoChanging ? input.invoiceNo! : existing.invoiceNo;
  const currencyRulesApply = nextStatus !== existing.status || nextInvoiceNo !== existing.invoiceNo;

  // Duplicate-milestone-billing guard only matters when a field that could
  // newly create a conflict is actually changing, and only for a
  // flat/milestone-value line (quantityBilled === 0) with a real
  // milestoneId — see assertNoDuplicateMilestoneBilling()'s comment.
  const milestoneFieldsChanging =
    input.milestoneId !== undefined || input.invoiceNo !== undefined || input.setIndex !== undefined;
  const mergedMilestoneId = input.milestoneId !== undefined ? input.milestoneId : existing.milestoneId;

  // P2/P3/P13 — same lock-then-check-then-write transaction as
  // createInvoiceLineForQuantityItem() above, keyed by the SAME
  // QuantityItem/Project/milestone-billing scope so a concurrent create and
  // a concurrent update (or a concurrent milestone delete) can never race
  // this one either. Milestone-percent resolution (needsRecompute's own
  // resolveMilestonePercent call) moves INSIDE the transaction for the
  // identical reason as the create path — see that function's own comment.
  // The financial-ceiling check re-runs whenever invoiceAmountINR is
  // actually changing (excluding this row's own prior amount from the sum
  // it compares against); the duplicate-milestone check re-runs under the
  // exact same condition as before this fix.
  const updated = await prisma.$transaction(
    async (tx) => {
      await lockQuantityItemForInvoiceWrite(tx, existing.quantityItemId);

      if (amountChange.invoiceAmountINR !== undefined) {
        await assertInvoiceAmountWithinLimit(
          tx,
          existing.quantityItemId,
          parentQuantityItem.woValue,
          amountChange.invoiceAmountINR,
          id
        );
      }

      let unitPriceINR = existing.unitPriceINR;
      let calculatedAmountINR = existing.calculatedAmountINR;
      let commercialAdjustmentINR = existing.commercialAdjustmentINR;

      if (needsRecompute) {
        const quantityBilled = input.quantityBilled ?? existing.quantityBilled;
        const mergedInvoiceAmountINR = amountChange.invoiceAmountINR ?? existing.invoiceAmountINR;

        if (mergedMilestoneId) {
          await lockProjectForMilestoneRead(tx, parentQuantityItem.projectId);
        }
        const milestonePercent = await resolveMilestonePercent(mergedMilestoneId, tx);

        unitPriceINR = parentQuantityItem.unitRateINR;
        ({ calculatedAmountINR, commercialAdjustmentINR } = computeAmounts({
          quantityBilled,
          unitPriceINR,
          milestonePercent,
          invoiceAmountINR: mergedInvoiceAmountINR,
        }));
      }

      if (milestoneFieldsChanging) {
        const mergedQuantityBilled = input.quantityBilled ?? existing.quantityBilled;
        if (mergedMilestoneId && mergedQuantityBilled === 0) {
          const dedupParams = {
            milestoneId: mergedMilestoneId,
            setIndex: input.setIndex !== undefined ? input.setIndex : existing.setIndex,
            quantityItemId: existing.quantityItemId,
          };
          await lockMilestoneBillingForInvoiceWrite(tx, dedupParams);
          await assertNoDuplicateMilestoneBilling(tx, {
            ...dedupParams,
            invoiceNo: input.invoiceNo ?? existing.invoiceNo,
            excludeLineId: id,
          });
        }
      }

      // Manual invoice numbering — renaming a line's invoice number is
      // allowed only to a number that is free portal-wide (never into
      // another existing invoice, which would merge them); a change of
      // letter case/spacing alone is rejected (it would split one invoice
      // into two spellings). The old number is released below if no line
      // still carries it.
      if (invoiceNoChanging) {
        if (nextInvoiceNo.toUpperCase() === existing.invoiceNo.trim().toUpperCase()) {
          throw new AppError("Changing only the letter case or spacing of an invoice number is not allowed.", 400);
        }
        await registerInvoiceNumberForLine(tx, { projectId: parentQuantityItem.projectId, invoiceNo: nextInvoiceNo, intent: "new" });
      }

      if (currencyRulesApply) {
        await enforceInvoiceCurrencyRules(tx, {
          projectId: parentQuantityItem.projectId,
          invoiceNo: nextInvoiceNo,
          currency: existing.currency,
          exchangeRateToINR: existing.exchangeRateToINR,
          targetStatus: nextStatus,
          excludeLineId: id,
        });
      }

      const written = await updateLineInRepository(
        id,
        {
          ...(invoiceNoChanging && { invoiceNo: nextInvoiceNo }),
          ...(input.invoiceDate !== undefined && { invoiceDate: input.invoiceDate }),
          ...(input.milestoneId !== undefined && { milestoneId: input.milestoneId }),
          ...(input.milestoneName !== undefined && { milestoneName: input.milestoneName }),
          ...(input.setIndex !== undefined && { setIndex: input.setIndex }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.quantityBilled !== undefined && { quantityBilled: input.quantityBilled }),
          ...amountChange,
          ...(input.clientReference !== undefined && { clientReference: input.clientReference }),
          ...(input.remarks !== undefined && { remarks: input.remarks }),
          ...(input.status !== undefined && { status: input.status }),
          ...(needsRecompute && { unitPriceINR, calculatedAmountINR, commercialAdjustmentINR }),
        },
        tx
      );
      if (invoiceNoChanging) {
        await releaseInvoiceNumberIfUnused(existing.invoiceNo, parentQuantityItem.projectId, tx);
      }
      return written;
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

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

  // Request Invoice workflow (Oct 2026) — Section B. The real business event
  // an Open InvoiceRequest is waiting for is "this line is no longer a Draft
  // — it is now a genuine invoice" (Raised, PartiallyPaid, or Paid), not
  // specifically "became Raised." A line can legitimately go straight from
  // Draft to PartiallyPaid or Paid (e.g. a quick single-PATCH update) without
  // ever passing through the literal "Raised" value, and that must fulfill
  // the request too. Gated on existing.status === "Draft" so this only ever
  // fires once per line, on its first transition out of Draft — the normal
  // Draft -> Raised -> PartiallyPaid -> Paid flow still fulfills exactly once
  // (at the Draft -> Raised step), never again on the later PartiallyPaid ->
  // Paid step, since existing.status is no longer "Draft" by then.
  const isGenuineInvoiceTransition =
    existing.status === "Draft" &&
    input.status !== undefined &&
    input.status !== "Draft" &&
    input.status !== "Cancelled";

  // Invoice Paid (Oct 2026) — Request Invoice workflow, final stage. Only a
  // genuine previous-status-!=-Paid -> Paid transition qualifies (see
  // isGenuinePaidTransition()'s own comment) — a re-save that leaves status
  // already Paid, or any transition to a different status, never fires this
  // again.
  const isGenuinePaidNow = input.status !== undefined && isGenuinePaidTransition(existing.status, updated.status);

  // Both calls below are fire-and-forget relative to the PATCH response (the
  // update has already committed above, and neither a fulfillment nor a
  // notification failure must ever be mistaken for the status change itself
  // failing to save) — but ordered relative to EACH OTHER. A direct
  // Draft -> Paid/PartiallyPaid transition makes isGenuineInvoiceTransition
  // and isGenuinePaidNow both true from this SAME PATCH, which means the
  // fulfillment write (sets InvoiceRequest.fulfilledInvoiceLineId) and the
  // Paid-notification's read of that exact link were previously started
  // independently with no ordering guarantee — the read could, and in a
  // live QA run did, run before the write landed, finding no link and
  // silently skipping the Invoice Paid notification/email. Awaiting
  // fulfillment first inside this one unawaited async block fixes that
  // while keeping the PATCH response itself just as non-blocking as before.
  void (async () => {
    if (isGenuineInvoiceTransition) {
      try {
        await fulfillOpenInvoiceRequestsForProject(parentQuantityItem.projectId, updated.id);
      } catch (error) {
        console.error("[invoices] fulfillOpenInvoiceRequestsForProject failed:", error instanceof Error ? error.message : error);
      }
    }

    if (isGenuinePaidNow) {
      try {
        await notifyInvoicePaidIfLinked(updated.id, {
          invoiceNo: updated.invoiceNo,
          invoiceAmountINR: updated.invoiceAmountINR,
          currency: updated.currency,
          invoiceAmountOriginal: updated.invoiceAmountOriginal,
          exchangeRateToINR: updated.exchangeRateToINR,
        });
      } catch (error) {
        console.error("[invoices] notifyInvoicePaidIfLinked failed:", error instanceof Error ? error.message : error);
      }
    }
  })();

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

  // Invoice Currency feature (Oct 2026) — confirmed rule: a DELETE
  // recalculates the project's currency lock. The lock is released only if
  // no line that ever reached Raised/PartiallyPaid/Paid/Cancelled remains;
  // otherwise it stays (cancelling never unlocks, and another genuine
  // invoice still requires the currency). Same lock order as every other
  // write in this file (QuantityItem first, the project's currency key
  // last), so a concurrent raise in another currency is serialized against
  // this delete and can never slip into a half-released lock.
  await prisma.$transaction(
    async (tx) => {
      await lockQuantityItemForInvoiceWrite(tx, existing.quantityItemId);
      await lockInvoiceNumber(existing.invoiceNo, tx);
      const currencyLockKey = `invoice-currency:${parentQuantityItem.projectId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${currencyLockKey}))`;
      try {
        await deleteLineInRepository(id, tx);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          throw new AppError("Invoice line not found.", 404);
        }
        throw error;
      }
      await clearProjectInvoiceCurrencyIfNoGenuineLines(parentQuantityItem.projectId, tx);
      // Manual invoice numbering — deleting the LAST line of an invoice
      // releases its number (the invoice no longer exists); cancelling keeps
      // it reserved.
      await releaseInvoiceNumberIfUnused(existing.invoiceNo, parentQuantityItem.projectId, tx);
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}

/**
 * Request Invoice workflow (Sept 2026) — Section C: "Send Invoice To." A
 * separate, MANUAL action the responsible person takes after an invoice
 * line has already, successfully been saved (this function only ever reads
 * an already-committed row — there is no code path that calls it before a
 * save succeeds). Recipients are re-validated against the database on every
 * call — never trusted as-is from the request body — so an inactive or
 * nonexistent id is silently dropped rather than emailed. Deliberately NOT
 * restricted to users holding "Raise Invoice": any active user may be a
 * recipient (this is a "share the result" action, not a raise-eligibility
 * decision).
 *
 * Performance fix (independent review) — validation (line exists, project
 * exists + caller has access, at least one recipient resolves to a real
 * active user) is still fully awaited, since the response must reflect a
 * genuinely valid action. Only the notification + per-recipient email work
 * — which was previously awaited here too, measured at ~2.1s for a single
 * recipient purely from SMTP round-trip time — is now fire-and-forget (see
 * notifyAndEmailSharedRecipients() below), matching the same pattern
 * already used by notifyAssignedResponsiblePerson()/
 * notifyRequesterInvoiceRaised() in invoiceRequest.service.ts. Folded into
 * this same change: the previous separate assertProjectAccessById() +
 * findProjectById() calls (two separate queries against Project) are
 * replaced by one findProjectByIdAny() + a direct assertProjectAccess()
 * call against the row it already loaded — same authorization logic, same
 * unfiltered-by-isDeleted behavior assertProjectAccessById itself used
 * (deliberately NOT switched to the isDeleted-filtering findProjectById,
 * which would have silently made this action stricter for an archived
 * project than every other invoice action in this file), just without the
 * second round trip.
 */
export async function sendInvoiceLineToUsers(
  id: string,
  input: SendInvoiceLineToInput,
  user: AccessTokenPayload
): Promise<{ sentTo: string[] }> {
  const line = await getLineById(id);
  if (!line) {
    throw new AppError("Invoice line not found.", 404);
  }
  const parentQuantityItem = await getQuantityItemById(line.quantityItemId);

  const project = await findProjectByIdAny(parentQuantityItem.projectId);
  if (!project) {
    throw new AppError("Project not found.", 404);
  }
  await assertProjectAccess(user, project);

  const recipients = await findActiveUsersByIds(input.userIds);
  if (recipients.length === 0) {
    throw new AppError("None of the selected recipients are currently active users.", 400);
  }

  const sharedByName = await getUserDisplayName(user.sub);

  // Fire-and-forget — everything the caller needs to know (which
  // recipients are real/active) is already decided above; nothing past
  // this point should make the HTTP response wait on SMTP delivery. Each
  // recipient is handled completely independently inside the helper
  // (Promise.allSettled — one recipient's failure can never affect
  // another's), and this call is wrapped in its own .catch() so a failure
  // here can never surface as an unhandled rejection or change the
  // already-decided success response below.
  void notifyAndEmailSharedRecipients(line, project, recipients, sharedByName).catch((error) => {
    console.error(
      "[invoices] notifyAndEmailSharedRecipients failed:",
      error instanceof Error ? error.message : error
    );
  });

  return { sentTo: recipients.map((r) => r.id) };
}

async function notifyAndEmailSharedRecipients(
  line: InvoiceLineRow,
  project: { id: string; prNo: string; client: string; projectTitle: string },
  recipients: { id: string; fullName: string; email: string }[],
  sharedByName: string
): Promise<void> {
  await notify(
    recipients.map((r) => r.id),
    {
      title: "An invoice has been shared with you",
      message: `${sharedByName} shared invoice ${line.invoiceNo} (${project.projectTitle}) with you.`,
      type: "INVOICE_SHARED",
      severity: "Info",
      entityType: "Invoice",
      entityId: project.id,
    }
  );

  const invoicesUrl = `${env.FRONTEND_URL}/projects/edit/${project.id}`;

  // Promise.allSettled, not a sequential for-await loop — every recipient's
  // email is attempted independently and in parallel; one recipient's
  // rejection can never delay or prevent another's send. Each iteration
  // keeps its own try/catch (unchanged from before this fix) so a thrown
  // error is only ever logged, never left to propagate.
  await Promise.allSettled(
    recipients.map(async (recipient) => {
      try {
        const email = buildInvoiceSharedEmail({
          recipientName: recipient.fullName,
          sharedByName,
          prNo: project.prNo,
          projectTitle: project.projectTitle,
          client: project.client,
          invoiceNo: line.invoiceNo,
          invoiceAmountINR: line.invoiceAmountINR,
          invoiceCurrency: line.currency,
          invoiceAmountOriginal: line.invoiceAmountOriginal,
          exchangeRateToINR: line.exchangeRateToINR,
          invoiceDateIso: line.invoiceDate.toISOString(),
          invoicesUrl,
        });
        const result = await sendEmail({ to: recipient.email, subject: email.subject, html: email.html });
        if (!result.success) {
          console.error(`[invoices] Shared email failed for ${recipient.email}: ${result.error}`);
        }
      } catch (error) {
        console.error(
          "[invoices] Unexpected error while sending Shared email:",
          error instanceof Error ? error.message : error
        );
      }
    })
  );
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
        // Invoice Currency feature (Oct 2026) — this ingest path exists
        // only to migrate pre-existing, pre-feature historical data (see
        // this function's own doc-comment), so every row it creates is
        // explicitly, confidently INR — never left ambiguous.
        currency: "INR",
        exchangeRateToINR: 1,
        invoiceAmountOriginal: row.invoiceAmountINR,
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

  // Manual invoice numbering — register every number this legacy batch
  // introduces (same semantics as a create without an intent): joining this
  // project's own number is fine; a number owned by another project is
  // rejected before any line is written.
  for (const invoiceNo of new Set(rowsToCreate.map((line) => line.invoiceNo))) {
    await prisma.$transaction((tx) => registerInvoiceNumberForLine(tx, { projectId, invoiceNo, intent: undefined }));
  }

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

function toReportInvoiceLineDto(row: DashboardInvoiceLineRow): ReportInvoiceLineListDto["items"][number] {
  return {
    id: row.id,
    projectId: row.projectId,
    quantityItemId: row.quantityItemId,
    status: row.status,
    invoiceAmountINR: row.invoiceAmountINR,
    invoiceDate: row.invoiceDate,
    invoiceNo: row.invoiceNo,
    quantityBilled: row.quantityBilled,
    currency: row.currency,
    exchangeRateToINR: row.exchangeRateToINR,
    invoiceAmountOriginal: row.invoiceAmountOriginal,
  };
}

/**
 * Every invoice line across every project this caller is authorized to
 * see — GET /invoice-items. Reuses findAuthorizedProjects()/
 * findInvoiceLinesForProjects() from dashboard.repository.ts verbatim: the
 * SAME project-visibility rule (hasUnrestrictedProjectVisibility()) and the
 * SAME QuantityItem-anchored InvoiceLine query the Dashboard's own Invoice
 * Raised KPI is built from (dashboard.service.ts's getDashboardSummary()) —
 * never a second, independently-drifting implementation.
 *
 * Sept 2026 — added specifically so Reports (frontend useReportsData.ts)
 * can compute Invoice Raised (and every other invoice-line-derived figure:
 * Cash Realized, status breakdowns, ageing) from this same live, complete
 * backend data, instead of from whatever happens to already be cached in
 * each project's browser-local invoiceItems mirror — which was only ever
 * populated by actually opening that project's Edit/View page at least
 * once in that browser, silently under-counting every project that never
 * was. Business rules (which statuses count, how amounts are capped) are
 * NOT reimplemented here — this returns raw lines only; the caller applies
 * the exact same rules dashboard.formulas.ts already documents
 * (invoiceRaisedFromLines() / paymentReceivedFromLines(): every
 * non-Cancelled line counts toward Invoice Raised; only Paid lines count
 * toward Cash Realized — PartiallyPaid never invents a partial cash
 * amount).
 */
export async function listAllInvoiceLinesForCaller(user: AccessTokenPayload): Promise<ReportInvoiceLineListDto> {
  const callerUserId = hasUnrestrictedProjectVisibility(user.roleName) ? undefined : user.sub;
  const projects = await findAuthorizedProjects(callerUserId);
  const lines = await findInvoiceLinesForProjects(projects.map((p) => p.id));
  return { items: lines.map(toReportInvoiceLineDto) };
}
