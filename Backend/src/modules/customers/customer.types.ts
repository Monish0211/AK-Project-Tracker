/**
 * Shared shapes reused across the Customer (Customer Master) module's layers
 * — mirrors employee.types.ts / EmployeeData.
 */
export interface CustomerData {
  customerCode?: string | null;
  customerName: string;
  companyName?: string | null;
  country?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;

  // GST Document Import/Extraction (Sep 2026) — plain optional text fields;
  // never populated automatically, only via a value the user reviewed and
  // confirmed (see CustomerModal.tsx). The GST document itself is a separate
  // Document row (Document.customerId), never stored on Customer directly.
  gstNumber?: string | null;
  gstLegalName?: string | null;
  gstTradeName?: string | null;
  gstState?: string | null;
}
