import type { QuantityItem } from "../types/QuantityItem";

export interface QuantityTotals {
  totalWOQty: number;
  totalInvoiceQty: number;
  totalPendingQty: number;
  pendingAmount: number;
  pendingInvoicePercentage: number;
  workOrderValue: number;
  workOrderValueINR: number;
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

export function calculateQuantity(
  items: QuantityItem[],
  currency: string = "INR",
  _exchangeRate: number = 1
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

  const totalWOValueProjectCurrency = items.reduce(
    (sum, item) => sum + ((item.woQty || 0) * (item.unitRate || 0)),
    0
  );

  const workOrderValue = currency === "INR" ? totalWOValueINR : totalWOValueProjectCurrency;
  const workOrderValueINR = totalWOValueINR;

  return {
    totalWOQty,
    totalInvoiceQty,
    totalPendingQty,
    pendingAmount,
    pendingInvoicePercentage,
    workOrderValue,
    workOrderValueINR,
  };
}

export function recalcQuantityItem(
  item: QuantityItem,
  projectCurrency: string = "INR",
  projectExchangeRate: number = 1
): QuantityItem {
  const currency = projectCurrency || "INR";
  const exchangeRate = currency === "INR" ? 1 : projectExchangeRate;
  const unitRateINR =
    currency === "INR"
      ? item.unitRate
      : item.unitRate * exchangeRate;

  const woValue = item.woQty * unitRateINR;

  const pendingQty = Math.max(
    item.woQty - (item.invoiceQty || 0),
    0
  );

  const pendingAmount = pendingQty * unitRateINR;

  return {
    ...item,
    currency,
    exchangeRate,
    unitRateINR,
    woValue,
    pendingQty,
    pendingAmount,
  };
}

export function createEmptyQuantityItem(
  projectCurrency: string = "INR",
  projectExchangeRate: number = 1
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
    exchangeRate: projectCurrency === "INR" ? 1 : projectExchangeRate,
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