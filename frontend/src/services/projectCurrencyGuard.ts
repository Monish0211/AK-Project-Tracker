import { apiClient } from "./apiClient";

/**
 * Edit Project in two windows (or two people): the project's saved currency, rates and quantity lines are read when a form opens and again just
 * before it saves. If they changed in between, the save is refused so an older screen never overwrites newer money. Other fields are not compared.
 */
export interface SavedCurrencyState {
  currency: string;
  currentExchangeRate: number;
  contractExchangeRate: number;
  /** The saved quantity lines' entered values, in a stable order. */
  lines: string;
}

export const STALE_PROJECT_MESSAGE =
  "This project's currency or quantities were changed in another window or by another user after you opened it, so nothing was saved. Reload the page to see the latest values, then save again.";

type CurrencyFields = Pick<SavedCurrencyState, "currency" | "currentExchangeRate" | "contractExchangeRate">;
interface SavedLine {
  id: string;
  description: string;
  woQty: number;
  uom: string;
  currency: string;
  unitRate: number;
  exchangeRate: number;
}

export async function readSavedCurrencyState(projectId: string): Promise<SavedCurrencyState> {
  const [project, quantity] = await Promise.all([
    apiClient.get<CurrencyFields>(`/projects/${projectId}`),
    apiClient.get<{ items: SavedLine[] }>(`/projects/${projectId}/quantity`),
  ]);
  const lines = quantity.items
    .map((l) => [l.id, l.description, l.woQty, l.uom, l.currency, l.unitRate, l.exchangeRate])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return {
    currency: project.currency,
    currentExchangeRate: project.currentExchangeRate,
    contractExchangeRate: project.contractExchangeRate,
    lines: JSON.stringify(lines),
  };
}

/** True when the form's project currency or a rate differs from the saved one. */
export function currencyDiffers(form: CurrencyFields, saved: CurrencyFields): boolean {
  return (
    (form.currency || "INR") !== saved.currency ||
    (form.currentExchangeRate ?? 1) !== saved.currentExchangeRate ||
    (form.contractExchangeRate ?? 1) !== saved.contractExchangeRate
  );
}

export function savedStateChanged(opened: SavedCurrencyState, now: SavedCurrencyState): boolean {
  return currencyDiffers(opened, now) || opened.lines !== now.lines;
}
