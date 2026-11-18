/**
 * Liquidated Damages (LD) — frontend helpers (Oct 2026, regional currency Phase 4 final). Mirrors the
 * backend's projectCompletion.rules.ts limits so the completion popup and the
 * API never disagree; the backend remains the authority.
 *
 * ldApplicable: null/undefined = not recorded (projects completed before this
 * feature) — never shown or exported as "No".
 *
 * Currency: LD is entered, stored and shown in the PROJECT's own currency — INR for an India
 * project (exactly as always), the regional currency (MYR, OMR, AED, QAR) for every other country.
 * An India amount lives in ldAmountINR; a regional amount in ldAmountRegional with its ldCurrency.
 * A recorded amount with NO ldCurrency is a LEGACY rupee amount typed before regional LD existed:
 * it stays INR and is never reinterpreted as a regional amount.
 */

export const LD_MAX_INR = 99_999_999_999.99;
export const LD_MAX_REGIONAL = 99_999_999_999.99;
export const LD_REMARKS_MAX = 500;

export interface LdRecord {
  ldApplicable: boolean | null;
  ldAmountINR: number | null;
  /** Amount in the project's own (non-INR) currency; null for an INR project and for legacy rupee records. */
  ldAmountRegional?: number | null | undefined;
  /** The currency the amount was recorded in; null/absent on a recorded amount = a legacy rupee record. */
  ldCurrency?: string | null | undefined;
  ldRemarks?: string | null;
}

/** The LD fields as they sit on a Project (all optional: a backend or cache without them reads as "not recorded"). */
export interface LdAmountFields {
  ldApplicable?: boolean | null | undefined;
  ldAmountINR?: number | null | undefined;
  ldAmountRegional?: number | null | undefined;
  ldCurrency?: string | null | undefined;
}

export function ldStatusLabel(ldApplicable: boolean | null | undefined): "Yes" | "No" | "Not recorded" {
  if (ldApplicable === true) return "Yes";
  if (ldApplicable === false) return "No";
  return "Not recorded";
}

/** True once an LD decision (Yes or No) has been recorded. */
export function isLdRecorded(ldApplicable: boolean | null | undefined): ldApplicable is boolean {
  return ldApplicable === true || ldApplicable === false;
}

/** Decimal places an LD amount may carry per currency (OMR is quoted in baisa). Mirrors the backend. */
export function ldDecimalsFor(currency: string | null | undefined): number {
  return currency === "OMR" ? 3 : 2;
}

/**
 * Parses the LD Amount text field in the project's currency: digits with an optional decimal point and
 * up to the currency's decimals (thousands separators are allowed and ignored). Returns the value or a
 * user-facing error. INR keeps its original messages exactly.
 */
export function parseLdAmountInput(text: string, currency: string = "INR"): { value: number; error: null } | { value: null; error: string } {
  const decimals = ldDecimalsFor(currency);
  const cleaned = text.replace(/,/g, "").trim();
  if (cleaned === "") return { value: null, error: "Enter the LD Amount." };
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(cleaned)) {
    if (/^-/.test(cleaned)) return { value: null, error: "LD Amount must be greater than zero." };
    if (new RegExp(`^\\d+\\.\\d{${decimals + 1},}$`).test(cleaned)) {
      return { value: null, error: `LD Amount can have at most ${decimals === 2 ? "two" : "three"} decimal places.` };
    }
    return { value: null, error: "LD Amount must be a valid number." };
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { value: null, error: "LD Amount must be a valid number." };
  if (value <= 0) return { value: null, error: "LD Amount must be greater than zero." };
  if (value > (currency === "INR" ? LD_MAX_INR : LD_MAX_REGIONAL)) return { value: null, error: "LD Amount is too large." };
  return { value, error: null };
}

export interface RecordedLdAmount {
  amount: number;
  /** The currency the amount is in: the project's own for a regional record, INR for an India or legacy rupee record. */
  currency: string;
  /** A rupee amount recorded before regional LD existed, on a project in another currency: shown as INR, never deducted from regional profit. */
  legacyRupees: boolean;
}

/**
 * The recorded LD amount with its currency, or null when LD is not Yes / has no amount. `projectCurrency` is the project's own currency (INR when omitted).
 * The single place that decides how a stored amount is read, so every screen, PDF and export agrees.
 */
export function recordedLdAmount(r: LdAmountFields | null | undefined, projectCurrency: string | null | undefined = "INR"): RecordedLdAmount | null {
  if (!r || r.ldApplicable !== true) return null;
  const project = projectCurrency || "INR";
  if (typeof r.ldAmountRegional === "number" && Number.isFinite(r.ldAmountRegional)) {
    return { amount: r.ldAmountRegional, currency: r.ldCurrency || project, legacyRupees: false };
  }
  if (typeof r.ldAmountINR === "number" && Number.isFinite(r.ldAmountINR)) {
    return { amount: r.ldAmountINR, currency: "INR", legacyRupees: project !== "INR" && !r.ldCurrency };
  }
  return null;
}

/** The fields to send/store for an LD amount entered in the project's currency: INR -> ldAmountINR (as always); anything else -> ldAmountRegional + ldCurrency. */
export function ldAmountFields(amount: number | null, currency: string | null | undefined): { ldCurrency: string | null; ldAmountINR: number | null; ldAmountRegional: number | null } {
  if (amount === null) return { ldCurrency: null, ldAmountINR: null, ldAmountRegional: null };
  const cur = currency || "INR";
  return cur === "INR"
    ? { ldCurrency: "INR", ldAmountINR: amount, ldAmountRegional: null }
    : { ldCurrency: cur, ldAmountINR: null, ldAmountRegional: amount };
}
