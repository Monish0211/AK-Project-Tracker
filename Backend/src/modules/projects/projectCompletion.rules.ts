/**
 * Project completion + Liquidated Damages (LD) rules (Oct 2026) — pure, no
 * Prisma, no I/O. project.service.ts applies the decision these return.
 *
 * Business rules (approved):
 *  - LD is recorded once, by the request that marks the project Completed
 *    (or creates it as Completed). The completing user must say whether LD
 *    applies; Yes requires a positive amount (≤ the currency's decimals, ≤ LD_MAX).
 *  - Currency (Phase 4 final): the amount is ALWAYS in the project's own
 *    currency — INR for an India project (exactly as before), the regional
 *    currency (MYR, OMR, AED, QAR) for every other country. The server decides
 *    the currency from the project's stored regional currency; a currency sent
 *    by the client is only checked against it, never trusted. An India amount
 *    goes to ldAmountINR (unchanged); a regional amount goes to
 *    ldAmountRegional with ldCurrency, and ldAmountINR stays empty.
 *  - Once recorded, LD cannot be changed through ordinary project updates.
 *    Re-sending the identical recorded values is a harmless no-op (so a
 *    duplicate submit can never record a second, different deduction);
 *    anything else is rejected with 409.
 *  - Reopening a project (status away from Completed) keeps the LD record;
 *    completing it again does not ask for LD again.
 *  - ldApplicable null = "not recorded" (projects completed before this
 *    feature, or bulk-imported). Never treated as "No".
 *  - ldCurrency null on a recorded amount = a LEGACY rupee amount typed before
 *    regional LD existed. It is never reinterpreted as a regional amount.
 *  - Completing also requires an Actual Completion Date and Completion
 *    Remarks of at least COMPLETION_REMARKS_MIN characters — the same rule
 *    the completion popup has always enforced, now enforced server-side too.
 */

export const COMPLETED_STATUS = "Completed";
export const COMPLETION_REMARKS_MIN = 20;
/** Largest LD the columns and business sense allow: 9,999.99 crore rupees / the same figure in any regional currency. */
export const LD_MAX_INR = 99_999_999_999.99;
export const LD_MAX_REGIONAL = 99_999_999_999.99;
export const LD_REMARKS_MAX = 500;

const INR = "INR";
/** Decimal places an LD amount may carry per currency (OMR is quoted in baisa). Everything else, including INR, keeps 2. */
const LD_DECIMALS: Record<string, number> = { OMR: 3 };
export function ldDecimalsFor(currency: string): number {
  return LD_DECIMALS[currency] ?? 2;
}

export interface LdInput {
  ldApplicable?: boolean | undefined;
  /** Rupee amount — accepted for an INR project only (the original field, so existing callers keep working). */
  ldAmountINR?: number | null | undefined;
  /** Amount in the PROJECT's currency (any project). */
  ldAmount?: number | null | undefined;
  /** Optional currency sent by the client; must equal the project's currency or the request is refused. */
  ldCurrency?: string | null | undefined;
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
  /** NULL = legacy record (a rupee amount typed before regional LD existed). */
  ldCurrency?: string | null;
  ldAmountRegional?: number | null;
}

export interface CompletionRequest extends LdInput {
  projectStatus?: string | undefined;
  actualCompletionDate?: Date | null | undefined;
  completionRemarks?: string | null | undefined;
}

export interface RecordLd {
  ldApplicable: boolean;
  /** The project's currency when LD applies, null when it does not. */
  ldCurrency: string | null;
  /** Filled only for an INR project. */
  ldAmountINR: number | null;
  /** Filled only for a non-INR project. */
  ldAmountRegional: number | null;
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

/** Normalises a project's stored currency: a project without one is a legacy India project (INR). */
function currencyOf(projectCurrency: string | null | undefined): string {
  const trimmed = (projectCurrency ?? "").trim().toUpperCase();
  return trimmed === "" ? INR : trimmed;
}

/** Validates an LD amount for a currency; returns an error message or null. INR keeps its original rules and wording exactly. */
export function ldAmountError(amount: unknown, currency: string = INR): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "LD Amount must be a valid number.";
  if (amount <= 0) return "LD Amount must be greater than zero.";
  if (amount > (currency === INR ? LD_MAX_INR : LD_MAX_REGIONAL)) return "LD Amount is too large.";
  const decimals = ldDecimalsFor(currency);
  const scale = 10 ** decimals;
  const scaled = amount * scale;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    return `LD Amount can have at most ${decimals === 2 ? "two" : "three"} decimal places.`;
  }
  return null;
}

function hasLdInput(input: LdInput): boolean {
  return (
    input.ldApplicable !== undefined ||
    input.ldAmountINR !== undefined ||
    input.ldAmount !== undefined ||
    input.ldCurrency !== undefined ||
    input.ldRemarks !== undefined
  );
}

function normaliseRemarks(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The amount the request carries, read in the project's currency. Returns the number (or null/undefined when absent) or a refusal. A rupee
 * amount is accepted for an INR project only; a regional project must use `ldAmount`, so an INR figure can never be stored as a regional one.
 */
function requestedAmount(input: LdInput, currency: string): { amount: number | null | undefined } | CompletionDecision {
  if (input.ldCurrency !== undefined && input.ldCurrency !== null && input.ldCurrency.trim().toUpperCase() !== currency) {
    return fail(400, `Liquidated Damages for this project must be entered in ${currency}, not ${input.ldCurrency.trim().toUpperCase() || "another currency"}.`);
  }
  if (currency !== INR) {
    if (input.ldAmountINR !== undefined && input.ldAmountINR !== null) {
      return fail(400, `Liquidated Damages for this project must be entered in ${currency}. A rupee (INR) amount is not accepted.`);
    }
    return { amount: input.ldAmount };
  }
  if (input.ldAmount !== undefined && input.ldAmountINR !== undefined && input.ldAmount !== input.ldAmountINR) {
    return fail(400, "Send the LD Amount once; two different amounts were given.");
  }
  return { amount: input.ldAmount !== undefined ? input.ldAmount : input.ldAmountINR };
}

/** Validates the LD part of a completion request; returns the values to store or a failure. */
function resolveLd(input: LdInput, currency: string): RecordLd | CompletionDecision {
  if (input.ldApplicable === undefined) {
    return fail(400, "Please choose whether Liquidated Damages (LD) apply before completing the project.");
  }
  const ldRemarks = normaliseRemarks(input.ldRemarks);
  if (ldRemarks !== null && ldRemarks.length > LD_REMARKS_MAX) {
    return fail(400, `LD Reference / Remarks can be at most ${LD_REMARKS_MAX} characters.`);
  }
  const requested = requestedAmount(input, currency);
  if ("ok" in requested) return requested;
  const { amount } = requested;
  if (!input.ldApplicable) {
    if (amount !== undefined && amount !== null) {
      return fail(400, "An LD Amount can only be given when LD is applicable.");
    }
    return { ldApplicable: false, ldCurrency: null, ldAmountINR: null, ldAmountRegional: null, ldRemarks };
  }
  if (amount === undefined || amount === null) {
    return fail(400, "LD Amount is required when LD is applicable.");
  }
  const error = ldAmountError(amount, currency);
  if (error) return fail(400, error);
  return currency === INR
    ? { ldApplicable: true, ldCurrency: INR, ldAmountINR: amount, ldAmountRegional: null, ldRemarks }
    : { ldApplicable: true, ldCurrency: currency, ldAmountINR: null, ldAmountRegional: amount, ldRemarks };
}

/** True when the request's LD values equal what is already recorded (a harmless re-submit). */
function matchesRecorded(existing: ExistingCompletionState, input: LdInput, currency: string): boolean {
  if (input.ldApplicable !== undefined && input.ldApplicable !== existing.ldApplicable) return false;
  if (input.ldCurrency !== undefined && input.ldCurrency !== null) {
    const recorded = existing.ldCurrency ?? (existing.ldAmountINR !== null ? INR : null);
    if (recorded !== null && input.ldCurrency.trim().toUpperCase() !== recorded) return false;
  }
  // A LEGACY rupee record on a regional project is re-sent unchanged by every ordinary save of the edit form. The identical rupee amount is the same record (it
  // is not "recording" a rupee LD on a regional project, which is refused); a different amount, or the same figure claimed as a regional one, is not.
  const recordedAsLegacyRupees = existing.ldAmountRegional == null && existing.ldAmountINR !== null && (existing.ldCurrency ?? null) === null;
  if (currency !== INR && recordedAsLegacyRupees && input.ldAmountINR !== undefined) {
    if (input.ldAmount !== undefined && input.ldAmount !== null) return false;
    const a = input.ldAmountINR ?? null;
    const b = existing.ldAmountINR ?? 0; // recordedAsLegacyRupees guarantees it is set
    if (a === null || Math.round(a * 100) !== Math.round(b * 100)) return false;
    return input.ldRemarks === undefined || normaliseRemarks(input.ldRemarks) === existing.ldRemarks;
  }
  const requested = requestedAmount({ ...input, ldCurrency: undefined }, currency);
  if ("ok" in requested) return false;
  if (requested.amount !== undefined) {
    const a = requested.amount ?? null;
    const b = existing.ldAmountRegional ?? existing.ldAmountINR;
    // The recorded amount is read in the currency it was recorded in; a regional request never matches a rupee record.
    const recordedInRupees = existing.ldAmountRegional == null && existing.ldAmountINR !== null;
    if (a !== null && recordedInRupees && currency !== INR) return false;
    const scale = 10 ** ldDecimalsFor(currency);
    if (a === null || b === null ? a !== b : Math.round(a * scale) !== Math.round(b * scale)) return false;
  }
  if (input.ldRemarks !== undefined && normaliseRemarks(input.ldRemarks) !== existing.ldRemarks) return false;
  return true;
}

/**
 * Decides what an update (or create, with existing = null) may do with the
 * completion and LD fields. Pure — the caller performs the writes.
 * `projectCurrency` is the project's stored regional currency (null/omitted = legacy India = INR).
 */
export function decideCompletion(existing: ExistingCompletionState | null, input: CompletionRequest, projectCurrency?: string | null): CompletionDecision {
  const currency = currencyOf(projectCurrency);
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
    if (hasLdInput(input) && !matchesRecorded(existing!, input, currency)) {
      return fail(409, "Liquidated Damages were already recorded for this project and cannot be changed here.");
    }
    return { ok: true, isCompletion, recordLd: null };
  }

  if (!isCompletion) {
    if (hasLdInput(input)) return fail(400, "Liquidated Damages can only be recorded when the project is marked Completed.");
    return { ok: true, isCompletion: false, recordLd: null };
  }

  const ld = resolveLd(input, currency);
  if ("ok" in ld) return ld;
  return { ok: true, isCompletion: true, recordLd: ld };
}

const INR_FORMAT = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "₹ 50,000.00" for rupees, "AED 1,234.50" / "OMR 703.510" for a regional amount (the project's own currency, never a rupee sign). */
export function ldAmountText(amount: number, currency: string | null | undefined): string {
  const cur = currencyOf(currency);
  if (cur === INR) return `₹ ${INR_FORMAT.format(amount)}`;
  const d = ldDecimalsFor(cur);
  return `${cur} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(amount)}`;
}

/** Server-side audit note text for a completion (stored as a ProjectNote). */
export function completionNoteMessage(args: {
  actualCompletionDate: Date;
  completionRemarks: string;
  completedByName: string;
  ld: {
    ldApplicable: boolean | null;
    ldAmountINR: number | null;
    ldRemarks: string | null;
    ldCurrency?: string | null;
    ldAmountRegional?: number | null;
  };
  ldNewlyRecorded: boolean;
}): string {
  const date = args.actualCompletionDate.toISOString().slice(0, 10);
  const regional = args.ld.ldAmountRegional ?? null;
  const ldLine =
    args.ld.ldApplicable === true
      ? `Liquidated Damages: Applicable — ${regional !== null ? ldAmountText(regional, args.ld.ldCurrency) : ldAmountText(args.ld.ldAmountINR ?? 0, INR)}`
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
