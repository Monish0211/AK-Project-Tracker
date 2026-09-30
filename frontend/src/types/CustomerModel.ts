export interface Customer {
  id: string;
  /** Optional human-readable customer code, if the organization assigns one. */
  customerId?: string;
  customerName: string;
  companyName?: string;
  country?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  status: "Active" | "Inactive";

  // GST Document Import/Extraction (Sep 2026) — plain optional text, whether
  // typed manually or copied from a reviewed AI suggestion. gstDocumentId is
  // present only once a GST document has actually been uploaded and
  // confirmed (never just because extraction ran) — see CustomerModal.tsx.
  gstNumber?: string;
  gstLegalName?: string;
  gstTradeName?: string;
  gstState?: string;
  gstDocumentId?: string;

  createdAt: string;
  updatedAt?: string;
}
