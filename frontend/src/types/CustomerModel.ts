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
  createdAt: string;
  updatedAt?: string;
}
