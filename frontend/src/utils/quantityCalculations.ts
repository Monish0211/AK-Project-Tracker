import type { QuantityItem } from "../types/QuantityItem";

export const GST_RATE_PERCENT = 18;

export interface QuantityTotals {
  totalWOQty: number;
  totalInvoiceQty: number;
  totalPendingQty: number;
  pendingAmount: number;
  pendingInvoicePercentage: number;
  workOrderValue: number;
  workOrderValueINR: number;
  /** The work order value in the project's regional currency (equal to workOrderValueINR for an INR or legacy project). */
  workOrderValueRegional: number;
  gstRate: number;
  gstAmount: number;
  grandTotal: number;
  /** Regional work order value plus GST (GST exists only for INR, so for any other region this is the regional value itself). */
  grandTotalRegional: number;
}

export const UOM_OPTIONS = [
  "LUMP SUM",
  "MAN-DAY",
  "MAN-HOUR",
  "DAY",
  "MONTH",
  "VISIT",
  "PERSON",
  "JOB",
  "PACKAGE",
  "NOS",
  "LOT",
  "SET",
  "TRIP",
] as const;

export function calculateProjectDuration(
  startDate: string,
  endDate: string
): string {
  if (!startDate || !endDate) return "—";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";

  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "—";

  return `${diffDays} Days`;
}

/**
 * The work order value of the lines in THEIR OWN (transaction) currency: quantity x unit rate, a LUMP SUM line counting its unit rate once. Nothing is
 * converted. Used by calculateQuantity below and by the PR detail page's Commercial Summary, so both always add the lines the same way.
 */
export function sumTransactionCurrencyValue(items: ReadonlyArray<Pick<QuantityItem, "uom" | "woQty" | "unitRate">>): number {
  return items.reduce((sum, item) => {
    const isLumpSum = (item.uom || "").trim().toUpperCase() === "LUMP SUM";
    const val = isLumpSum ? (item.unitRate || 0) : ((item.woQty || 0) * (item.unitRate || 0));
    return sum + val;
  }, 0);
}

export function calculateQuantity(
  items: QuantityItem[],
  currency: string = "INR",
  _exchangeRate: number = 1,
  gstApplicable: boolean = false,
  regionalCurrency?: string | null
): QuantityTotals {
  const totalWOQty = items.reduce(
    (sum, item) => sum + (item.woQty || 0),
    0
  );

  const totalInvoiceQty = items.reduce(
    (sum, item) => sum + (item.invoiceQty || 0),
    0
  );

  const totalPendingQty = items.reduce(
    (sum, item) => sum + (item.pendingQty || 0),
    0
  );

  const pendingAmount = items.reduce(
    (sum, item) => sum + (item.pendingAmount || 0),
    0
  );

  const pendingInvoicePercentage =
    totalWOQty === 0
      ? 0
      : (totalPendingQty / totalWOQty) * 100;

  const totalWOValueINR = items.reduce(
    (sum, item) => sum + (item.woValue || 0),
    0
  );

  const totalWOValueProjectCurrency = sumTransactionCurrencyValue(items);

  const workOrderValue = currency === "INR" ? totalWOValueINR : totalWOValueProjectCurrency;
  const workOrderValueINR = totalWOValueINR;
  // Phase 3: the same total in the project's regional currency. A legacy line (no regional value) falls back to its INR value, so for an
  // INR or legacy project this equals workOrderValueINR exactly.
  const workOrderValueRegional = regionalCurrency && regionalCurrency !== "INR"
    ? items.reduce((sum, item) => sum + (item.woValueRegional ?? 0), 0)
    : totalWOValueINR;

  // GST is only ever applicable for INR projects, always calculated on the
  // Total Work Order Value (INR).
  const isGstEffective = currency === "INR" && gstApplicable;
  const gstRate = isGstEffective ? GST_RATE_PERCENT : 0;
  const gstAmount = isGstEffective ? (workOrderValueINR * GST_RATE_PERCENT) / 100 : 0;
  const grandTotal = workOrderValueINR + gstAmount;
  const grandTotalRegional = workOrderValueRegional + gstAmount;

  return {
    totalWOQty,
    totalInvoiceQty,
    totalPendingQty,
    pendingAmount,
    pendingInvoicePercentage,
    workOrderValue,
    workOrderValueINR,
    workOrderValueRegional,
    gstRate,
    gstAmount,
    grandTotal,
    grandTotalRegional,
  };
}

/**
 * The commercial currency a project opens with (Phase 3). A project that has a regional currency but no priced quantity line yet opens in that
 * currency at rate 1 (an Oman project reads OMR, not the old INR default). Once any line is priced, the saved currency is left exactly as saved.
 * A legacy project (no regional currency) is never changed.
 *
 * Nov 2026 fix: ONLY the untouched default - INR at rate 1, what the server stores when nobody chose a currency (the backend applies the same rule in
 * regionalDefaultCurrencyFields) - is replaced. A currency someone actually chose (USD at 3.67 on an Abu Dhabi project) is ALWAYS kept, even while the
 * quantity lines are not known yet: Edit Project first opens the project from its general information alone (no lines - the browser mirror is empty
 * after a logout), and the old "no priced line" test then replaced the saved USD with AED before the lines arrived.
 */
export function resolveOpeningCurrency(project: {
  currency?: string | null | undefined;
  currentExchangeRate?: number | null | undefined;
  regionalCurrency?: string | null | undefined;
  quantityItems?: { unitRate?: number | undefined }[] | undefined;
}): { currency: string; useRegionalDefault: boolean } {
  const saved = project.currency || "INR";
  const regional = project.regionalCurrency || null;
  const hasPricedLine = Array.isArray(project.quantityItems) && project.quantityItems.some((i) => typeof i.unitRate === "number" && i.unitRate > 0);
  const untouchedDefault = saved === "INR" && (typeof project.currentExchangeRate === "number" ? project.currentExchangeRate : 1) === 1;
  const useRegionalDefault = Boolean(regional) && !hasPricedLine && saved !== regional && untouchedDefault;
  return { currency: useRegionalDefault ? (regional as string) : saved, useRegionalDefault };
}

export interface PricedQuantityLine {
  exchangeRate: number;
  unitRateINR: number;
  woValue: number;
  unitRateRegional: number;
  woValueRegional: number;
}

/** Removes floating-point noise (3695.9999999999995) from a regional amount without rounding real digits. */
function clean(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Prices one Quantity line — the SAME rule the backend applies (Backend quantityCurrency.rules.ts computeQuantityAmounts), so the screen and
 * the saved figures always agree. The exchange rate is regional currency per ONE unit of the transaction currency ("1 USD = 4.50 MYR").
 * A legacy project (no regional currency) and an INR-region project follow the original INR arithmetic exactly; any other regional
 * currency fills the regional figures and leaves the INR-named ones at 0, so a non-INR amount is never shown or summed as rupees.
 */
export function priceQuantityLine(
  line: { woQty: number; uom: string; currency: string; unitRate: number; exchangeRate: number },
  regionalCurrency?: string | null
): PricedQuantityLine {
  const regional = regionalCurrency || "INR";
  const lump = (line.uom || "").trim().toUpperCase() === "LUMP SUM";

  if (!regionalCurrency) {
    const unitRateINR = line.currency === "INR" ? line.unitRate : line.unitRate * line.exchangeRate;
    const woValue = lump ? unitRateINR : line.woQty * unitRateINR;
    return { exchangeRate: line.exchangeRate, unitRateINR, woValue, unitRateRegional: unitRateINR, woValueRegional: woValue };
  }

  const sameAsRegional = line.currency === regional;
  const exchangeRate = sameAsRegional ? 1 : line.exchangeRate;

  if (regional === "INR") {
    const unitRateINR = sameAsRegional ? line.unitRate : line.unitRate * exchangeRate;
    const woValue = lump ? unitRateINR : line.woQty * unitRateINR;
    return { exchangeRate, unitRateINR, woValue, unitRateRegional: unitRateINR, woValueRegional: woValue };
  }

  const unitRateRegional = clean(sameAsRegional ? line.unitRate : line.unitRate * exchangeRate);
  const woValueRegional = clean(lump ? unitRateRegional : line.woQty * unitRateRegional);
  return { exchangeRate, unitRateINR: 0, woValue: 0, unitRateRegional, woValueRegional };
}

export function recalcQuantityItem(
  item: QuantityItem,
  projectCurrency: string = "INR",
  projectExchangeRate: number = 1,
  regionalCurrency?: string | null
): QuantityItem {
  const currency = projectCurrency || regionalCurrency || "INR";
  const priced = priceQuantityLine(
    { woQty: item.woQty, uom: item.uom, currency, unitRate: item.unitRate, exchangeRate: projectExchangeRate },
    regionalCurrency
  );
  // Legacy / INR projects: the rate of the INR currency is always 1, exactly as before.
  const exchangeRate = regionalCurrency ? priced.exchangeRate : currency === "INR" ? 1 : projectExchangeRate;
  const { unitRateINR, woValue, unitRateRegional, woValueRegional } = priced;

  const isLumpSum = (item.uom || "").trim().toUpperCase() === "LUMP SUM";
  const pendingQty = isLumpSum
    ? Math.max(1 - (item.invoiceQty || 0), 0)
    : Math.max(item.woQty - (item.invoiceQty || 0), 0);

  // In the project's regional currency (INR for a legacy or India project, so unchanged there).
  const pendingAmount = pendingQty * unitRateRegional;

  return {
    ...item,
    currency,
    exchangeRate,
    unitRateINR,
    woValue,
    unitRateRegional,
    woValueRegional,
    pendingQty,
    pendingAmount,
  };
}

/**
 * The project fields that follow from the project's regional currency changing because its PR Category was chosen or changed (Add Project and
 * PR Request). A currency, unit rate or value the user entered is never silently replaced:
 * - no line priced yet: the transaction currency becomes the new regional one at rate 1;
 * - priced in the new regional currency: rate 1;
 * - priced in another currency and the regional currency is the same (Abu Dhabi <-> FZE): currency and rate stay;
 * - priced in another currency and the regional currency is different: currency and prices stay, the rate is cleared and must be entered again.
 * Every line is repriced and the totals refresh. Pass null to fall back to a legacy-style INR project (nothing else moves).
 */
export function applyRegionalCurrencyToProject<T extends { quantityItems: QuantityItem[]; gstApplicable: boolean }>(
  project: T,
  regionalCurrency: string | null
): Partial<T> & { regionalCurrency: string | null } {
  if (!regionalCurrency) return { regionalCurrency: null } as Partial<T> & { regionalCurrency: string | null };
  const before = project as T & { regionalCurrency?: string | null; currency?: string; currentExchangeRate?: number; contractExchangeRate?: number };
  const keepsEnteredCurrency = Boolean(before.currency) && before.currency !== regionalCurrency && project.quantityItems.some((item) => item.unitRate > 0);
  const sameRegional = before.regionalCurrency === regionalCurrency;
  const currency = keepsEnteredCurrency ? (before.currency as string) : regionalCurrency;
  const rate = !keepsEnteredCurrency ? 1 : sameRegional ? (before.currentExchangeRate ?? 0) : 0;
  const contractRate = keepsEnteredCurrency && sameRegional ? (before.contractExchangeRate ?? rate) : rate;
  const quantityItems = project.quantityItems.map((item) => recalcQuantityItem(item, currency, rate, regionalCurrency));
  const totals = calculateQuantity(quantityItems, currency, rate, project.gstApplicable, regionalCurrency);
  return {
    regionalCurrency,
    currency,
    currentExchangeRate: rate,
    contractExchangeRate: contractRate,
    quantityItems,
    ...totals,
    totalProjectBudget: regionalCurrency === "INR" ? totals.workOrderValueINR : totals.workOrderValueRegional,
  } as unknown as Partial<T> & { regionalCurrency: string | null };
}

/**
 * Reprices every Quantity line with the project's SAVED currency and rate and refreshes the totals (Total WO Value, GST, Total Project Budget).
 * Used when a saved PR request is loaded for editing or review: the stored payload carries only the raw inputs (qty, unit rate, rate), so
 * without this the line values and totals keep their empty-form defaults (Total WO Value 0) until someone edits a field.
 * Unlike applyRegionalCurrencyToProject, the currency and exchange rate are kept exactly as saved. While the regional currency is not known
 * yet, each line also keeps its own saved rate: it must not become 1 just because the currency is INR.
 */
export function recalculateProjectQuantities<
  T extends { quantityItems: QuantityItem[]; currency: string; currentExchangeRate: number; gstApplicable: boolean }
>(project: T, regionalCurrency: string | null | undefined): Partial<T> {
  const regional = regionalCurrency || null;
  const quantityItems = project.quantityItems.map((item) => {
    const priced = recalcQuantityItem(item, project.currency, project.currentExchangeRate, regional);
    return regional ? priced : { ...priced, exchangeRate: item.exchangeRate };
  });
  const totals = calculateQuantity(quantityItems, project.currency, project.currentExchangeRate, project.gstApplicable, regional);
  return {
    quantityItems,
    ...totals,
    totalProjectBudget: !regional || regional === "INR" ? totals.workOrderValueINR : totals.workOrderValueRegional,
  } as unknown as Partial<T>;
}

export function createEmptyQuantityItem(
  projectCurrency: string = "INR",
  projectExchangeRate: number = 1,
  regionalCurrency?: string | null
): QuantityItem {
  return {
    id: crypto.randomUUID(),

    description: "",

    woQty: 0,
    invoiceQty: 0,
    pendingQty: 0,

    uom: "DAY",
    assignedTo: "",

    currency: projectCurrency,

    unitRate: 0,
    exchangeRate: projectCurrency === (regionalCurrency || "INR") ? 1 : projectExchangeRate,
    unitRateINR: 0,

    woValue: 0,
    pendingAmount: 0,
  };
}

export function canRemoveQuantityItem(
  items: QuantityItem[]
): boolean {
  return items.length > 1;
}

export function formatIndianNumber(
  value: number
): string {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

export function formatIndianCurrency(
  value: number
): string {
  const formatted = value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `₹ ${formatted}`;
}

export function parseNumericInput(
  rawValue: string
): number {
  if (rawValue.trim() === "") {
    return 0;
  }

  const parsed = Number(rawValue);

  return Number.isNaN(parsed) ? 0 : parsed;
}