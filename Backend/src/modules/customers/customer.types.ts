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
}
