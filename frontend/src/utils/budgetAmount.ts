/**
 * Optional budget amounts: "not entered" (null) is different from "entered as 0".
 *
 * Non Man-Hour Budget Amount is stored as a nullable column. The Weekly Missing Other Project Expenses email will rely on
 * telling a blank budget from an explicit zero, so the form must never turn a blank into 0 (nor hide a real 0). These helpers
 * keep that rule in one place, with no React and no browser dependencies, so it can be unit-tested.
 */

/** What the budget input shows: nothing for "not entered", the number (including 0) otherwise. */
export function budgetInputValue(amount: number | null | undefined): number | "" {
  return typeof amount === "number" && Number.isFinite(amount) ? amount : "";
}

/** The amount for what the user typed: blank (or anything that is not a finite number) is null; "0" is 0. */
export function parseBudgetInput(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** The amount the API receives: the number when there is one (including 0), otherwise an explicit null - never 0, never undefined. */
export function budgetAmountForPayload(amount: number | null | undefined): number | null {
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null;
}
