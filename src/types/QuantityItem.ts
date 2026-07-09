export interface QuantityItem {
  id: string;

  // Description
  description: string;

  // Quantity
  woQty: number;
  invoiceQty: number;
  pendingQty: number;

  // Unit of Measure & Assignment
  uom: string;
  assignedTo?: string;

  // Currency
  currency: string;

  // Pricing
  unitRate: number;
  exchangeRate: number;
  unitRateINR: number;

  // Amount
  woValue: number;
  pendingAmount: number;
}