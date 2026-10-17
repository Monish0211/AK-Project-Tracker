/**
 * Liquidated Damages (LD) — frontend helpers (Oct 2026). Mirrors the
 * backend's projectCompletion.rules.ts limits so the completion popup and the
 * API never disagree; the backend remains the authority.
 *
 * ldApplicable: null/undefined = not recorded (projects completed before this
 * feature) — never shown or exported as "No".
 */

export const LD_MAX_INR = 99_999_999_999.99;
export const LD_REMARKS_MAX = 500;

export interface LdRecord {
  ldApplicable: boolean | null;
  ldAmountINR: number | null;
  ldRemarks?: string | null;
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

/**
 * Parses the LD Amount text field: digits with an optional decimal point and
 * up to two decimals (Indian-style thousands separators are allowed and
 * ignored). Returns the value or a user-facing error.
 */
export function parseLdAmountInput(text: string): { value: number; error: null } | { value: null; error: string } {
  const cleaned = text.replace(/,/g, "").trim();
  if (cleaned === "") return { value: null, error: "Enter the LD Amount." };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    if (/^-/.test(cleaned)) return { value: null, error: "LD Amount must be greater than zero." };
    if (/^\d+\.\d{3,}$/.test(cleaned)) return { value: null, error: "LD Amount can have at most two decimal places." };
    return { value: null, error: "LD Amount must be a valid number." };
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { value: null, error: "LD Amount must be a valid number." };
  if (value <= 0) return { value: null, error: "LD Amount must be greater than zero." };
  if (value > LD_MAX_INR) return { value: null, error: "LD Amount is too large." };
  return { value, error: null };
}
