/**
 * Customer Master response/list shapes — same split as employee.dto.ts.
 */
export interface CustomerDto {
  id: string;

  /** Maps the frontend's optional `customerId` organization code. */
  customerCode: string | null;
  customerName: string;
  companyName: string | null;
  country: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;

  status: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedCustomerListDto {
  items: CustomerDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** POST /customers/import response — all-or-nothing success counts. */
export interface ImportCustomersResultDto {
  imported: number;
  skipped: number;
}
