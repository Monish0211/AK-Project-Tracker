export interface QuantityItem {
  id: string;

  description: string;

  woQty: number;

  invoiceQty: number;

  pendingQty: number;

  unitRate: number;

  pendingAmount: number;
}