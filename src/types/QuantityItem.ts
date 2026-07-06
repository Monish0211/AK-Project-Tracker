export interface QuantityItem {
  id: string;

  // Description
  description: string;

  // Quantity
  woQty: number;
  invoiceQty: number;
  pendingQty: number;

  // Currency
  currency: string;

  // Pricing
  unitRate: number;
  exchangeRate: number;
  unitRateINR: number;

  // Amount
  pendingAmount: number;
}