import type { QuantityItem } from "../types/QuantityItem";

export interface QuantityTotals {
  totalWOQty: number;
  totalInvoiceQty: number;
  totalPendingQty: number;
  pendingAmount: number;
  pendingInvoicePercentage: number;
}

export function calculateQuantity(items: QuantityItem[]): QuantityTotals {
  const totalWOQty = items.reduce((sum, item) => sum + item.woQty, 0);

  const totalInvoiceQty = items.reduce(
    (sum, item) => sum + item.invoiceQty,
    0
  );

  const totalPendingQty = items.reduce(
    (sum, item) => sum + item.pendingQty,
    0
  );

  const pendingAmount = items.reduce(
    (sum, item) => sum + item.pendingAmount,
    0
  );

  const pendingInvoicePercentage =
    totalWOQty === 0 ? 0 : (totalPendingQty / totalWOQty) * 100;

  return {
    totalWOQty,
    totalInvoiceQty,
    totalPendingQty,
    pendingAmount,
    pendingInvoicePercentage,
  };
}

export function recalcQuantityItem(item: QuantityItem): QuantityItem {
  const pendingQty = item.woQty - item.invoiceQty;
  const pendingAmount = pendingQty * item.unitRate;

  return {
    ...item,
    pendingQty,
    pendingAmount,
  };
}

export function createEmptyQuantityItem(): QuantityItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    woQty: 0,
    invoiceQty: 0,
    pendingQty: 0,
    unitRate: 0,
    pendingAmount: 0,
  };
}

export function formatIndianNumber(value: number): string {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

export function formatIndianCurrency(value: number): string {
  const formatted = value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `₹ ${formatted}`;
}

export function parseNumericInput(rawValue: string): number {
  if (rawValue.trim() === "") {
    return 0;
  }

  const parsed = Number(rawValue);

  return Number.isNaN(parsed) ? 0 : parsed;
}
