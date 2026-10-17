/**
 * Project completion + Liquidated Damages (LD) rules (Oct 2026) — pure, no
 * Prisma, no I/O. project.service.ts applies the decision these return.
 *
 * Business rules (approved):
 *  - LD is recorded once, by the request that marks the project Completed
 *    (or creates it as Completed). The completing user must say whether LD
 *    applies; Yes requires a positive INR amount (≤ 2 decimals, ≤ LD_MAX_INR).
 *  - Once recorded, LD cannot be changed through ordinary project updates.
 *    Re-sending the identical recorded values is a harmless no-op (so a
 *    duplicate submit can never record a second, different deduction);
 *    anything else is rejected with 409.
 *  - Reopening a project (status away from Completed) keeps the LD record;
 *    completing it again does not ask for LD again.
 *  - ldApplicable null = "not recorded" (projects completed before this
 *    feature, or bulk-imported). Never treated as "No".
 *  - Completing also requires an Actual Completion Date and Completion
 *    Remarks of at least COMPLETION_REMARKS_MIN characters — the same rule
 *    the completion popup has always enforced, now enforced server-side too.
 */

export const COMPLETED_STATUS = "Completed";
export const COMPLETION_REMARKS_MIN = 20;
/** Largest LD the column (Decimal(14,2)) and business sense allow: ₹9,999.99 crore. */
export const LD_MAX_INR = 99_999_999_999.99;
export const LD_REMARKS_MAX = 500;

export interface LdInput {
  ldApplicable?: boolean | undefined;
  ldAmountINR?: number | null | undefined;
  ldRemarks?: string | null | undefined;
}

export interface ExistingCompletionState {
  projectStatus: string;
  actualCompletionDate: Date | null;
  completionRemarks: string | null;
  ldApplicable: boolean | null;
  /** Stored amount as a number (Decimal converted by the caller), null when not applicable/not recorded. */
  ldAmountINR: number | null;
  ldRemarks: string | null;
}

export interface CompletionRequest extends LdInput {
  projectStatus?: string | undefined;
  actualCompletionDate?: Date | null | undefined;
  completionRemarks?: string | null | undefined;
}

export interface RecordLd {
  ldApplicable: boolean;
  ldAmountINR: number | null;
  ldRemarks: string | null;
}

export type CompletionDecision =
  | {
      ok: true;
      /** This request moves the project into Completed (an audit note is written). */
      isCompletion: boolean;
      /** LD to record now (only on a completion while LD is still unrecorded). */
      recordLd: RecordLd | null;
    }
  | { ok: false; status: 400 | 409; message: string };

const fail = (status: 400 | 409, message: string): CompletionDecision => ({ ok: false, status, message });

/** Validates an LD amount; returns an error message or null. */
export function ldAmountError(amount: unknown): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "LD Amount must be a valid number.";
  if (amount <= 0) return "LD Amount must be greater than zero.";
  if (amount > LD_MAX_INR) return "LD Amount is too large.";
  const cents = amount * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) return "LD Amount can have at most two decimal places.";
  return null;
}

function hasLdInput(input: LdInput): boolean {
  return input.ldApplicable !== undefined || input.ldAmountINR !== undefined || input.ldRemarks !== undefined;
}

function normaliseRemarks(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Validates the LD part of a completion request; returns the values to store or a failure. */
function resolveLd(input: LdInput): RecordLd | CompletionDecision {
  if (input.ldApplicable === undefined) {
    return fail(400, "Please choose whether Liquidated Damages (LD) apply before completing the project.");
  }
  const ldRemarks = normaliseRemarks(input.ldRemarks);
  if (ldRemarks !== null && ldRemarks.length > LD_REMARKS_MAX) {
    return fail(400, `LD Reference / Remarks can be at most ${LD_REMARKS_MAX} characters.`);
  }
  if (!input.ldApplicable) {
    if (input.ldAmountINR !== undefined && input.ldAmountINR !== null) {
      return fail(400, "An LD Amount can only be given when LD is applicable.");
    }
    return { ldApplicable: false, ldAmountINR: null, ldRemarks };
  }
  if (input.ldAmountINR === undefined || input.ldAmountINR === null) {
    return fail(400, "LD Amount is required when LD is applicable.");
  }
  const error = ldAmountError(input.ldAmountINR);
  if (error) return fail(400, error);
  return { ldApplicable: true, ldAmountINR: input.ldAmountINR, ldRemarks };
}

/** True when the request's LD values equal what is already recorded (a harmless re-submit). */
function matchesRecorded(existing: ExistingCompletionState, input: LdInput): boolean {
  if (input.ldApplicable !== undefined && input.ldApplicable !== existing.ldApplicable) return false;
  if (input.ldAmountINR !== undefined) {
    const a = input.ldAmountINR ?? null;
    const b = existing.ldAmountINR;
    if (a === null || b === null ? a !== b : Math.round(a * 100) !== Math.round(b * 100)) return false;
  }
  if (input.ldRemarks !== undefined && normaliseRemarks(input.ldRemarks) !== existing.ldRemarks) return false;
  return true;
}

/**
 * Decides what an update (or create, with existing = null) may do with the
 * completion and LD fields. Pure — the caller performs the writes.
 */
export function decideCompletion(existing: ExistingCompletionState | null, input: CompletionRequest): CompletionDecision {
  const wasCompleted = existing?.projectStatus === COMPLETED_STATUS;
  const isCompletion = input.projectStatus === COMPLETED_STATUS && !wasCompleted;
  const ldRecorded = existing !== null && existing.ldApplicable !== null;

  if (isCompletion) {
    const date = input.actualCompletionDate !== undefined ? input.actualCompletionDate : existing?.actualCompletionDate ?? null;
    if (!date) return fail(400, "Actual Completion Date is required to complete the project.");
    const remarks = (input.completionRemarks !== undefined ? input.completionRemarks : existing?.completionRemarks ?? null)?.trim() ?? "";
    if (remarks.length < COMPLETION_REMARKS_MIN) {
      return fail(400, `Completion Remarks are required and must be at least ${COMPLETION_REMARKS_MIN} characters long.`);
    }
  }

  if (ldRecorded) {
    // Reopened-then-recompleted, or any later edit: the original record stands.
    if (hasLdInput(input) && !matchesRecorded(existing!, input)) {
      return fail(409, "Liquidated Damages were already recorded for this project and cannot be changed here.");
    }
    return { ok: true, isCompletion, recordLd: null };
  }

  if (!isCompletion) {
    if (hasLdInput(input)) return fail(400, "Liquidated Damages can only be recorded when the project is marked Completed.");
    return { ok: true, isCompletion: false, recordLd: null };
  }

  const ld = resolveLd(input);
  if ("ok" in ld) return ld;
  return { ok: true, isCompletion: true, recordLd: ld };
}

const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Server-side audit note text for a completion (stored as a ProjectNote). */
export function completionNoteMessage(args: {
  actualCompletionDate: Date;
  completionRemarks: string;
  completedByName: string;
  ld: { ldApplicable: boolean | null; ldAmountINR: number | null; ldRemarks: string | null };
  ldNewlyRecorded: boolean;
}): string {
  const date = args.actualCompletionDate.toISOString().slice(0, 10);
  const ldLine =
    args.ld.ldApplicable === true
      ? `Liquidated Damages: Applicable — ₹ ${INR.format(args.ld.ldAmountINR ?? 0)}`
      : args.ld.ldApplicable === false
        ? "Liquidated Damages: Not applicable"
        : "Liquidated Damages: Not recorded";
  const lines = [
    "PROJECT COMPLETED",
    `Completion Date: ${date}`,
    `Completed By: ${args.completedByName}`,
    args.ldNewlyRecorded ? ldLine : `${ldLine} (recorded earlier, unchanged)`,
  ];
  if (args.ld.ldRemarks) lines.push(`LD Reference / Remarks: ${args.ld.ldRemarks}`);
  lines.push(`Remarks: ${args.completionRemarks.trim()}`);
  return lines.join("\n");
}
