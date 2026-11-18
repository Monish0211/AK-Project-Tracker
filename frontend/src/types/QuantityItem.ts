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

  // Regional-currency price and value (Phase 3): this line converted into the PROJECT's regional currency at exchangeRate (regional
  // currency per one unit of `currency`). unitRateINR / woValue stay INR-only (0 for a project whose regional currency is not INR).
  // Absent on a line saved before Phase 3, which is read as the INR value.
  unitRateRegional?: number | null;
  woValueRegional?: number | null;
}