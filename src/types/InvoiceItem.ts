export interface InvoiceEntry {
  id: string;

  invoiceNumber: string;

  invoiceDate: string;

  invoiceAmount: number;

  invoiceAmountINR: number;

  invoiceReference: string;

  remarks: string;

  currency: string;

  exchangeRate: number;

  attachmentName: string;
}

export interface InvoiceItem {
  id: string;

  description: string;

  numberOfDays: number;

  location: string;

  unitPrice: number;

  totalPrice: number;

  invoices: InvoiceEntry[];
}
