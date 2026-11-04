import { Prisma } from "../../../../generated/prisma/client.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { assertProjectAccessById } from "../../../shared/utils/projectAccess.js";
import { getUserDisplayName } from "../../../shared/utils/userDisplayName.js";
import { userHasApprovalPermission } from "../../../shared/middleware/requireApprovalPermission.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { lockInvoiceNumber, updateLine } from "../../invoices/repository/invoice.repository.js";
import type { InvoiceAuditContext } from "../../invoices/repository/invoiceStatusEvent.repository.js";
import { normalizeCurrency } from "../../invoices/invoiceCurrency.rules.js";
import type { InvoiceCurrency } from "../../invoices/invoiceCurrency.rules.js";
import { notifyInvoiceStatusEvent } from "../../invoices/services/invoice.service.js";
import { notifyInvoicePaidIfLinked } from "../../invoiceRequests/services/invoiceRequest.service.js";
import { decimalToMinor, floatToMinor, formatMoney } from "../money.rules.js";
import { parsePaymentInput } from "../paymentInput.rules.js";
import type { FieldError, ParsedPaymentInput, RawPaymentInput } from "../paymentInput.rules.js";
import { statusJustifiedBySettlement } from "../paymentSettlement.rules.js";
import type { SettlementResult } from "../paymentSettlement.rules.js";
import { settlementFromRecords } from "../paymentCash.rules.js";
import * as repo from "../repository/invoicePayment.repository.js";
import type { PaymentRow } from "../repository/invoicePayment.repository.js";
import type {
  InvoicePaymentContextDto,
  InvoicePaymentDto,
  InvoicePaymentOverviewDto,
  InvoicePaymentPreviewDto,
  RecordPaymentResultDto,
  ReversePaymentResultDto,
  SettlementSummaryDto,
} from "../dto/invoicePayment.dto.js";

/**
 * Invoice Payment workflow — the one place a payment is recorded, previewed or reversed, and the ONLY place an invoice
 * moves to Partially Paid or Paid. The backend is authoritative: the browser sends what was typed, this service re-derives
 * the invoice amount and currency from the database, runs the settlement engine, and decides.
 *
 *   Total Settled = bank amount received + all deductions (invoice currency);  Outstanding = invoice amount - Total Settled
 *   settled = 0 -> status unchanged | 0 < settled < invoice -> Partially Paid | settled = invoice -> Paid | settled > invoice -> refused
 *
 * Every write happens in ONE transaction under the invoice-number advisory lock (the same lock invoice creation and renaming
 * use): payment rows, the audit event, and the resulting status of the invoice's lines with their InvoiceStatusEvent history.
 * A repeated Save of the same attempt (idempotency key) returns the stored payment instead of creating another.
 *
 * Authorization: authenticate + Invoices module + denyReadOnlyWrites (routes), project access (here), and the existing
 * "Edit Invoice" approval to record, preview or reverse. There is no approval step for any deduction.
 */

export const RECORD_PAYMENT_APPROVAL = "Edit Invoice";

/** A rejection that carries a structured body (field errors / rule violations / settlement) for the client. */
export class PaymentRejectedError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    public readonly payload: Record<string, unknown>
  ) {
    super(message, statusCode);
    this.name = "PaymentRejectedError";
    Object.setPrototypeOf(this, PaymentRejectedError.prototype);
  }
}

type Client = Prisma.TransactionClient | typeof prisma;
type LineRow = Awaited<ReturnType<typeof repo.findInvoiceLines>>[number];

export interface PaymentSubmission extends RawPaymentInput {
  projectId: string;
  invoiceNo: string;
  idempotencyKey?: string | undefined;
}

// ── Loading the invoice ─────────────────────────────────────────────────────────────────────────

interface LoadedInvoice {
  projectId: string;
  canonicalInvoiceNo: string;
  currency: InvoiceCurrency;
  lines: LineRow[];
  activeLines: LineRow[];
  /** The invoice amount in the invoice currency's minor units. */
  dueMinor: bigint;
  status: string;
  blockedReason: string | null;
}

function cycleStatus(activeLines: LineRow[]): string {
  if (activeLines.length === 0) return "Cancelled";
  if (activeLines.every((line) => line.status === "Paid")) return "Paid";
  if (activeLines.some((line) => line.status === "Paid" || line.status === "PartiallyPaid")) return "PartiallyPaid";
  if (activeLines.some((line) => line.status === "Raised")) return "Raised";
  return "Draft";
}

async function loadInvoice(client: Client, projectId: string, invoiceNo: string): Promise<LoadedInvoice> {
  // No separate project lookup: every caller has already passed assertProjectAccessById(), which answers 404 for a missing project.
  const lines = await repo.findInvoiceLines(projectId, invoiceNo, client);
  if (lines.length === 0) throw new AppError("Invoice not found.", 404);
  const activeLines = lines.filter((line) => line.status !== "Cancelled");
  if (activeLines.length === 0) throw new AppError("This invoice is cancelled, so no payment can be recorded.", 409);

  const currencies = new Set(activeLines.map((line) => normalizeCurrency(line.currency)));
  if (currencies.size !== 1) throw new AppError("This invoice has lines in more than one currency, so a payment cannot be settled against it.", 409);
  const currency = [...currencies][0]!;

  let dueMinor = 0n;
  for (const line of activeLines) {
    if (currency !== "INR" && line.invoiceAmountOriginal === null) {
      throw new AppError("This invoice line has no amount in the invoice currency, so a payment cannot be settled against it.", 409);
    }
    dueMinor += floatToMinor(line.invoiceAmountOriginal ?? line.invoiceAmountINR, currency);
  }

  const status = cycleStatus(activeLines);
  let blockedReason: string | null = null;
  if (activeLines.some((line) => line.status === "Draft")) blockedReason = "This invoice is still a Draft. Raise it before recording a payment.";
  else if (status === "Paid") blockedReason = "This invoice is already fully settled and marked Paid.";

  return { projectId, canonicalInvoiceNo: activeLines[0]!.invoiceNo.trim(), currency, lines, activeLines, dueMinor, status, blockedReason };
}

// ── Settlement helpers ──────────────────────────────────────────────────────────────────────────

function settlementOf(loaded: LoadedInvoice, active: PaymentRow[], candidate?: ParsedPaymentInput): SettlementResult {
  return settlementFromRecords({
    currency: loaded.currency,
    dueMinor: loaded.dueMinor,
    active,
    ...(candidate && {
      candidate: {
        receipts: candidate.receipts.map((receipt) => ({ amountMinor: receipt.amountMinor })),
        adjustments: candidate.adjustments.map((entry) => ({ category: entry.category, amountMinor: entry.amountMinor })),
      },
    }),
  });
}

export function toSummaryDto(result: SettlementResult): SettlementSummaryDto {
  const { currency } = result;
  return {
    currency,
    invoiceAmount: formatMoney(result.dueMinor, currency),
    bankReceived: formatMoney(result.cashMinor, currency),
    deductions: formatMoney(result.deductionsMinor, currency),
    deductionsByCategory: result.deductionsByCategory.map((entry) => ({ category: entry.category, amount: formatMoney(entry.amountMinor, currency) })),
    totalSettled: formatMoney(result.settledMinor, currency),
    outstanding: formatMoney(result.outstandingMinor, currency),
    outcome: result.outcome,
    resultingStatus: statusJustifiedBySettlement(result),
    violations: result.violations.map((v) => ({ code: v.code, message: v.message })),
  };
}

// ── DTO mapping ─────────────────────────────────────────────────────────────────────────────────

const day = (value: Date | null): string | null => (value ? value.toISOString().slice(0, 10) : null);

type StatusTransition = { lines?: Array<{ lineId: string; from: string; to: string }> } | null;

function movedTo(row: PaymentRow): string | null {
  const transition = row.statusTransition as StatusTransition;
  return transition?.lines?.[0]?.to ?? null;
}

export function toPaymentDto(row: PaymentRow): InvoicePaymentDto {
  const currency = row.currency;
  return {
    id: row.id,
    projectId: row.projectId,
    invoiceNo: row.invoiceNo,
    currency,
    status: row.status as "ACTIVE" | "REVERSED",
    receipts: row.receipts.map((receipt) => ({
      id: receipt.id,
      paymentDate: day(receipt.paymentDate),
      amountReceived: formatMoney(decimalToMinor(receipt.amountReceived, currency), currency),
      currency: receipt.currency,
      reference: receipt.reference,
      notes: receipt.notes,
    })),
    adjustments: row.adjustments.map((entry) => ({
      id: entry.id,
      category: entry.category,
      amount: formatMoney(decimalToMinor(entry.amount, currency), currency),
      reason: entry.reason,
      expectedReleaseDate: day(entry.expectedReleaseDate),
      reminderDate: day(entry.reminderDate),
      exchangeRate: entry.exchangeRate ? entry.exchangeRate.toString() : null,
    })),
    recordedByName: row.recordedByName,
    recordedAt: row.recordedAt.toISOString(),
    reversal: row.reversedAt ? { at: row.reversedAt.toISOString(), byName: row.reversedByName ?? "Unknown User", reason: row.reversalReason ?? "" } : null,
    movedInvoiceTo: movedTo(row),
  };
}

// ── Permission ──────────────────────────────────────────────────────────────────────────────────

async function canRecordPayments(user: AccessTokenPayload): Promise<boolean> {
  if (user.roleName === "Read Only") return false;
  return userHasApprovalPermission(user.sub, [RECORD_PAYMENT_APPROVAL]);
}

async function assertCanRecord(user: AccessTokenPayload): Promise<void> {
  if (!(await canRecordPayments(user))) {
    throw new AppError("You do not have permission to record or reverse invoice payments.", 403);
  }
}

// ── Read ────────────────────────────────────────────────────────────────────────────────────────

function buildOverview(loaded: LoadedInvoice, payments: PaymentRow[], canRecord: boolean): InvoicePaymentOverviewDto {
  const active = payments.filter((payment) => payment.status === "ACTIVE");
  const context: InvoicePaymentContextDto = {
    projectId: loaded.projectId,
    invoiceNo: loaded.canonicalInvoiceNo,
    currency: loaded.currency,
    status: loaded.status,
    lineCount: loaded.activeLines.length,
    invoiceAmount: formatMoney(loaded.dueMinor, loaded.currency),
    canRecord,
    recordBlockedReason: loaded.blockedReason,
    exchangeRateToINR: String(loaded.activeLines[0]?.exchangeRateToINR ?? 1),
  };
  return {
    invoice: context,
    payments: active.map(toPaymentDto),
    reversedPayments: payments.filter((payment) => payment.status === "REVERSED").map(toPaymentDto),
    summary: toSummaryDto(settlementOf(loaded, active)),
  };
}

export async function getInvoicePaymentOverview(projectId: string, invoiceNo: string, user: AccessTokenPayload): Promise<InvoicePaymentOverviewDto> {
  await assertProjectAccessById(projectId, user);
  // Independent lookups run together instead of one after another (access is checked first so a caller without it never learns
  // whether the invoice exists).
  const [loaded, canRecord] = await Promise.all([loadInvoice(prisma, projectId, invoiceNo), canRecordPayments(user)]);
  const payments = await repo.findPaymentsForInvoice(projectId, loaded.canonicalInvoiceNo);
  return buildOverview(loaded, payments, canRecord);
}

// ── Evaluate a submission (shared by preview and save) ──────────────────────────────────────────

interface Evaluation {
  errors: FieldError[];
  parsed: ParsedPaymentInput | null;
  result: SettlementResult | null;
}

function evaluate(loaded: LoadedInvoice, active: PaymentRow[], submission: PaymentSubmission): Evaluation {
  const parsedOutcome = parsePaymentInput(submission, { currency: loaded.currency, todayIso: new Date().toISOString().slice(0, 10) });
  if (!parsedOutcome.value) return { errors: parsedOutcome.errors, parsed: null, result: null };
  return { errors: [], parsed: parsedOutcome.value, result: settlementOf(loaded, active, parsedOutcome.value) };
}

function assertPayable(loaded: LoadedInvoice): void {
  if (loaded.blockedReason) throw new AppError(loaded.blockedReason, 409);
}

export async function previewInvoicePayment(submission: PaymentSubmission, user: AccessTokenPayload): Promise<InvoicePaymentPreviewDto> {
  await assertProjectAccessById(submission.projectId, user);
  await assertCanRecord(user);
  const loaded = await loadInvoice(prisma, submission.projectId, submission.invoiceNo);
  assertPayable(loaded);
  const active = (await repo.findPaymentsForInvoice(submission.projectId, loaded.canonicalInvoiceNo)).filter((payment) => payment.status === "ACTIVE");
  const evaluation = evaluate(loaded, active, submission);
  const result = evaluation.result;
  return {
    valid: evaluation.errors.length === 0,
    errors: evaluation.errors,
    summary: result ? toSummaryDto(result) : null,
    alreadyRecorded: toSummaryDto(settlementOf(loaded, active)),
    canSave: evaluation.errors.length === 0 && result !== null && result.violations.length === 0,
  };
}

// ── Record ──────────────────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LineChange {
  lineId: string;
  from: string;
  to: string;
}

export async function recordInvoicePayment(submission: PaymentSubmission, user: AccessTokenPayload): Promise<RecordPaymentResultDto> {
  await assertProjectAccessById(submission.projectId, user);
  await assertCanRecord(user);
  const key = submission.idempotencyKey?.trim() ?? "";
  if (!UUID.test(key)) throw new AppError("A valid idempotency key is required to save a payment.", 400);

  const [replay, actorName] = await Promise.all([repo.findPaymentByIdempotencyKey(key), getUserDisplayName(user.sub)]);
  if (replay) return replayResult(replay, submission, user);

  const audit: InvoiceAuditContext = { actorUserId: user.sub, actorName, source: "invoice_payment" };

  const outcome = await prisma.$transaction(
    async (tx) => {
      await lockInvoiceNumber(submission.invoiceNo, tx);

      const again = await repo.findPaymentByIdempotencyKey(key, tx);
      if (again) return { kind: "replay" as const, payment: again };

      const loaded = await loadInvoice(tx, submission.projectId, submission.invoiceNo);
      assertPayable(loaded);
      const active = (await repo.findPaymentsForInvoice(submission.projectId, loaded.canonicalInvoiceNo, tx)).filter((payment) => payment.status === "ACTIVE");

      const evaluation = evaluate(loaded, active, submission);
      if (!evaluation.parsed || !evaluation.result) {
        throw new PaymentRejectedError("Please correct the highlighted fields.", 400, { errors: evaluation.errors });
      }
      const { parsed, result } = evaluation;
      if (result.violations.length > 0) {
        throw new PaymentRejectedError(result.violations[0]!.message, 422, { violations: result.violations.map((v) => ({ code: v.code, message: v.message })), summary: toSummaryDto(result) });
      }

      const currency = loaded.currency;
      const payment = await repo.insertPayment(tx, {
        projectId: loaded.projectId,
        invoiceNo: loaded.canonicalInvoiceNo,
        currency,
        gstApplicable: false,
        gstRatePercent: null,
        gstAmount: null,
        idempotencyKey: key,
        recordedByUserId: user.sub,
        recordedByName: actorName,
        receipts: parsed.receipts.map((receipt) => ({
          paymentDate: receipt.paymentDate,
          currency,
          amountReceived: formatMoney(receipt.amountMinor, currency),
          gstReceived: "0",
          reference: receipt.reference,
          notes: receipt.notes,
        })),
        adjustments: parsed.adjustments.map((entry) => ({
          category: entry.category,
          amount: formatMoney(entry.amountMinor, currency),
          reason: entry.reason,
          expectedReleaseDate: entry.expectedReleaseDate,
          reminderDate: entry.reminderDate,
          exchangeRate: entry.exchangeRate,
          convertedAmount: null,
          // Every deduction category counts toward settlement; there is no approval step.
          countsTowardSettlement: true,
          settlementComponent: "BASE",
          treatmentNote: null,
        })),
      });

      // The status the settlement leads to (Partially Paid / Paid), applied to every non-cancelled line of THIS invoice only,
      // in this same transaction with its status history.
      const target = statusJustifiedBySettlement(result);
      const changes: Array<LineChange & { row: Awaited<ReturnType<typeof updateLine>> }> = [];
      if (target) {
        for (const line of loaded.activeLines) {
          if (line.status === target) continue;
          const row = await updateLine(line.id, { status: target }, audit, tx);
          changes.push({ lineId: line.id, from: line.status, to: target, row });
        }
        if (changes.length > 0) {
          await repo.setStatusTransition(tx, payment.id, { lines: changes.map(({ lineId, from, to }) => ({ lineId, from, to })) });
        }
      }

      await repo.insertPaymentEvent(tx, {
        paymentId: payment.id,
        projectId: loaded.projectId,
        invoiceNo: loaded.canonicalInvoiceNo,
        eventType: "PAYMENT_RECORDED",
        actorUserId: user.sub,
        actorName,
        details: paymentEventDetails(result, changes.map(({ lineId, from, to }) => ({ lineId, from, to }))),
      });

      // The figures the response needs are read on THIS connection before it is released, rather than queuing for another one
      // after the commit (under load the connection pool, not the database, is what requests wait on).
      const fresh = (await repo.findPaymentById(payment.id, tx))!;
      const loadedAfter = await loadInvoice(tx, loaded.projectId, loaded.canonicalInvoiceNo);
      const paymentsAfter = await repo.findPaymentsForInvoice(loaded.projectId, loadedAfter.canonicalInvoiceNo, tx);
      return { kind: "created" as const, payment: fresh, loaded, changes, previousStatus: loaded.status, target, loadedAfter, paymentsAfter };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  if (outcome.kind === "replay") return replayResult(outcome.payment, submission, user);

  if (outcome.changes.length > 0) {
    const { loaded, changes, previousStatus, target } = outcome;
    // After the commit, exactly like the status PATCH path: notifications never decide whether the save succeeded.
    void (async () => {
      try {
        await notifyInvoiceStatusEvent(loaded.projectId, loaded.canonicalInvoiceNo, `status changed from ${previousStatus} to ${target}.`);
      } catch (error) {
        console.error("[invoicePayments] status notification failed:", error instanceof Error ? error.message : error);
      }
      if (target !== "Paid") return;
      for (const change of changes) {
        try {
          await notifyInvoicePaidIfLinked(change.lineId, {
            invoiceNo: change.row.invoiceNo,
            invoiceAmountINR: change.row.invoiceAmountINR,
            currency: change.row.currency,
            invoiceAmountOriginal: change.row.invoiceAmountOriginal,
            exchangeRateToINR: change.row.exchangeRateToINR,
          });
        } catch (error) {
          console.error("[invoicePayments] notifyInvoicePaidIfLinked failed:", error instanceof Error ? error.message : error);
        }
      }
    })();
  }

  return {
    payment: toPaymentDto(outcome.payment),
    overview: buildOverview(outcome.loadedAfter, outcome.paymentsAfter, true),
    newInvoiceStatus: outcome.changes.length > 0 ? outcome.target : null,
    replayed: false,
  };
}

function paymentEventDetails(result: SettlementResult, statusChanges: LineChange[]): Prisma.InputJsonValue {
  const summary = toSummaryDto(result);
  return {
    currency: summary.currency,
    invoiceAmount: summary.invoiceAmount,
    bankReceived: summary.bankReceived,
    deductions: summary.deductions,
    deductionsByCategory: summary.deductionsByCategory,
    totalSettled: summary.totalSettled,
    outstanding: summary.outstanding,
    outcome: summary.outcome,
    statusChanges: statusChanges.map(({ lineId, from, to }) => ({ lineId, from, to })),
  };
}

async function replayResult(payment: PaymentRow, submission: PaymentSubmission, user: AccessTokenPayload): Promise<RecordPaymentResultDto> {
  // The key belongs to one attempt by one user on one invoice; anything else is a client bug, not a replay.
  if (payment.projectId !== submission.projectId || payment.invoiceNo.trim().toUpperCase() !== submission.invoiceNo.trim().toUpperCase() || payment.recordedByUserId !== user.sub) {
    throw new AppError("This save attempt identifier has already been used for a different payment.", 409);
  }
  const loaded = await loadInvoice(prisma, payment.projectId, payment.invoiceNo);
  const payments = await repo.findPaymentsForInvoice(payment.projectId, loaded.canonicalInvoiceNo);
  return { payment: toPaymentDto(payment), overview: buildOverview(loaded, payments, true), newInvoiceStatus: movedTo(payment), replayed: true };
}

// ── Reverse ─────────────────────────────────────────────────────────────────────────────────────

export async function reverseInvoicePayment(paymentId: string, reason: string, user: AccessTokenPayload): Promise<ReversePaymentResultDto> {
  const existing = await repo.findPaymentById(paymentId);
  if (!existing) throw new AppError("Payment not found.", 404);
  await assertProjectAccessById(existing.projectId, user);
  await assertCanRecord(user);
  const cleanReason = reason.trim();
  if (cleanReason.length < 3) throw new AppError("A reason is required to reverse a payment.", 400);
  if (cleanReason.length > 500) throw new AppError("The reversal reason can be at most 500 characters.", 400);

  const actorName = await getUserDisplayName(user.sub);
  const audit: InvoiceAuditContext = { actorUserId: user.sub, actorName, source: "invoice_payment_reversal" };

  const outcome = await prisma.$transaction(
    async (tx) => {
      await lockInvoiceNumber(existing.invoiceNo, tx);
      const reversed = await repo.markReversed(tx, paymentId, { userId: user.sub, name: actorName, reason: cleanReason });
      if (!reversed) throw new AppError("This payment has already been reversed.", 409);

      const loaded = await loadInvoice(tx, existing.projectId, existing.invoiceNo);
      const all = await repo.findPaymentsForInvoice(existing.projectId, loaded.canonicalInvoiceNo, tx);
      const active = all.filter((payment) => payment.status === "ACTIVE");
      const result = settlementOf(loaded, active);
      const target = statusJustifiedBySettlement(result);

      // Lines that payments moved are re-pointed at what the REMAINING payments justify: Paid, Partially Paid, or — with none left —
      // the status they had before the first payment touched them. Lines no payment ever moved (legacy) are left alone.
      const changes: LineChange[] = [];
      for (const line of loaded.activeLines) {
        if (line.status !== "Paid" && line.status !== "PartiallyPaid") continue;
        const original = originalStatusOf(all, line.id);
        if (original === null) continue;
        const desired = target ?? original;
        if (line.status === desired) continue;
        await updateLine(line.id, { status: desired }, audit, tx);
        changes.push({ lineId: line.id, from: line.status, to: desired });
      }

      await repo.insertPaymentEvent(tx, {
        paymentId,
        projectId: existing.projectId,
        invoiceNo: loaded.canonicalInvoiceNo,
        eventType: "PAYMENT_REVERSED",
        actorUserId: user.sub,
        actorName,
        details: { ...(paymentEventDetails(result, changes) as Record<string, unknown>), reason: cleanReason } as Prisma.InputJsonValue,
      });
      const loadedAfter = await loadInvoice(tx, existing.projectId, existing.invoiceNo);
      const paymentsAfter = await repo.findPaymentsForInvoice(existing.projectId, loadedAfter.canonicalInvoiceNo, tx);
      return { loaded, changes, loadedAfter, paymentsAfter };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  if (outcome.changes.length > 0) {
    const first = outcome.changes[0]!;
    void notifyInvoiceStatusEvent(
      outcome.loaded.projectId,
      outcome.loaded.canonicalInvoiceNo,
      `status changed from ${first.from} to ${first.to} because a payment was reversed.`
    ).catch((error) => console.error("[invoicePayments] reversal notification failed:", error instanceof Error ? error.message : error));
  }

  return { overview: buildOverview(outcome.loadedAfter, outcome.paymentsAfter, true), newInvoiceStatus: outcome.changes.length > 0 ? outcome.changes[0]!.to : null };
}

/** The status a line had before the FIRST payment moved it (from the oldest payment that moved it); null when no payment ever did. */
function originalStatusOf(allPaymentsOldestFirst: PaymentRow[], lineId: string): string | null {
  for (const payment of allPaymentsOldestFirst) {
    const transition = payment.statusTransition as StatusTransition;
    const entry = transition?.lines?.find((line) => line.lineId === lineId);
    if (entry) return entry.from;
  }
  return null;
}
