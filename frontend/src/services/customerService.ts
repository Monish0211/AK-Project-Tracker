/**
 * Customer Master — PostgreSQL / backend API is the sole authoritative source.
 *
 * Pattern mirrors employeeService's API-backed methods (apiClient + DTO mapping).
 * An in-memory cache backs synchronous getCustomers() for callers that still
 * expect a sync read (Reports, Project Client Name autocomplete). That cache
 * is filled only from GET /customers — never from localStorage or the legacy
 * frontend seed file. Old localStorage["customers"] is intentionally left
 * untouched and unread so we neither overwrite backend data nor discard
 * browser-side history without an explicit migration.
 */
import * as XLSX from "xlsx";

import type { Customer } from "../types/CustomerModel";
import { apiClient, ApiError } from "./apiClient";

export interface CustomerInput {
  customerId?: string;
  customerName: string;
  companyName?: string;
  country?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  status: "Active" | "Inactive";
}

export interface SaveCustomerResult {
  success: boolean;
  message?: string;
  customer?: Customer;
}

export interface CustomerListParams {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortField?: "customerName" | "status" | "createdAt" | "companyName";
  sortDirection?: "asc" | "desc";
}

export interface CustomerListResult {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

interface BackendCustomerDto {
  id: string;
  customerCode: string | null;
  customerName: string;
  companyName: string | null;
  country: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface BackendPaginatedCustomerList {
  items: BackendCustomerDto[];
  total: number;
  page: number;
  pageSize: number;
}

interface CustomerPayload {
  customerCode: string | null;
  customerName: string;
  companyName: string | null;
  country: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  status: "Active" | "Inactive";
}

/** In-memory only — never written to localStorage as authoritative storage. */
let customersCache: Customer[] = [];

function notifyCustomersChanged(): void {
  window.dispatchEvent(new Event("pmo:data-changed"));
}

/**
 * Updates the in-memory cache. Notifications are for mutations only —
 * a plain GET must NOT dispatch "pmo:data-changed", or any page that
 * re-fetches on that event (Customer Master + useLiveRefresh) will loop
 * forever: fetch → notify → refreshKey++ → fetch → …
 */
function setCustomersCache(customers: Customer[], options?: { notify?: boolean }): void {
  customersCache = customers;
  if (options?.notify !== false) {
    notifyCustomersChanged();
  }
}

function upsertCustomersCache(customers: Customer[]): void {
  const byId = new Map(customersCache.map((c) => [c.id, c]));
  customers.forEach((c) => byId.set(c.id, c));
  setCustomersCache(Array.from(byId.values()), { notify: true });
}

function removeFromCustomersCache(id: string): void {
  setCustomersCache(
    customersCache.filter((c) => c.id !== id),
    { notify: true }
  );
}

function toCustomer(dto: BackendCustomerDto): Customer {
  return {
    id: dto.id,
    customerId: dto.customerCode || undefined,
    customerName: dto.customerName,
    companyName: dto.companyName || undefined,
    country: dto.country || undefined,
    contactPerson: dto.contactPerson || undefined,
    email: dto.email || undefined,
    phone: dto.phone || undefined,
    status: (dto.status === "Inactive" ? "Inactive" : "Active") as Customer["status"],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function toCustomerPayload(input: CustomerInput): CustomerPayload {
  const emptyToNull = (value?: string) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  };

  return {
    customerCode: emptyToNull(input.customerId),
    customerName: input.customerName.trim(),
    companyName: emptyToNull(input.companyName),
    country: emptyToNull(input.country),
    contactPerson: emptyToNull(input.contactPerson),
    email: emptyToNull(input.email),
    phone: emptyToNull(input.phone),
    status: input.status,
  };
}

/**
 * Synchronous read of the in-memory cache (filled by fetchCustomersFromApi).
 * Returns [] until the first successful API load — never seeds from
 * localStorage or the legacy frontend seed file.
 */
export function getCustomers(): Customer[] {
  return customersCache;
}

/** GET /customers — authoritative list; refreshes the in-memory cache. */
export async function fetchCustomersFromApi(params: CustomerListParams = {}): Promise<CustomerListResult> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 1000));
  query.set("sortField", params.sortField ?? "createdAt");
  query.set("sortDirection", params.sortDirection ?? "desc");

  const result = await apiClient.get<BackendPaginatedCustomerList>(`/customers?${query.toString()}`);
  const items = result.items.map(toCustomer);
  // Silent: list GETs must not broadcast pmo:data-changed (see setCustomersCache).
  setCustomersCache(items, { notify: false });
  return { items, total: result.total, page: result.page, pageSize: result.pageSize };
}

/** Convenience: load the full directory for autocomplete / Customer Master page. */
export async function loadCustomersForApp(): Promise<Customer[]> {
  const { items } = await fetchCustomersFromApi({ page: 1, pageSize: 1000, sortField: "customerName", sortDirection: "asc" });
  return items;
}

export async function fetchCustomerByIdFromApi(id: string): Promise<Customer> {
  const dto = await apiClient.get<BackendCustomerDto>(`/customers/${id}`);
  const customer = toCustomer(dto);
  upsertCustomersCache([customer]);
  return customer;
}

export async function addCustomer(input: CustomerInput): Promise<SaveCustomerResult> {
  try {
    const dto = await apiClient.post<BackendCustomerDto>("/customers", toCustomerPayload(input));
    const customer = toCustomer(dto);
    upsertCustomersCache([customer]);
    return { success: true, customer };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Unable to save customer.";
    return { success: false, message };
  }
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<SaveCustomerResult> {
  try {
    const dto = await apiClient.patch<BackendCustomerDto>(`/customers/${id}`, toCustomerPayload(input));
    const customer = toCustomer(dto);
    upsertCustomersCache([customer]);
    return { success: true, customer };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Unable to save customer.";
    return { success: false, message };
  }
}

export async function deleteCustomer(id: string): Promise<void> {
  await apiClient.delete(`/customers/${id}`);
  removeFromCustomersCache(id);
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

export interface FileImportResult extends ImportResult {
  errors: string[];
}

const REQUIRED_HEADERS = ["Customer Name"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parses .xlsx/.csv client-side (unchanged UI contract), then POSTs the batch
 * to /customers/import. Backend all-or-nothing: on rejection, nothing is
 * written locally or remotely.
 */
export async function importCustomersFromFile(file: File): Promise<FileImportResult> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
    return { imported: 0, skipped: 0, errors: ["Unsupported file type. Please upload a .xlsx or .csv file."] };
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return { imported: 0, skipped: 0, errors: ["The uploaded file contains no sheets."] };
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });

  if (rows.length === 0) {
    return { imported: 0, skipped: 0, errors: ["The uploaded file is empty."] };
  }

  const [headerRow, ...dataRows] = rows;
  const fileHeaders = headerRow.map((h) => String(h ?? "").trim());

  const missing = REQUIRED_HEADERS.filter(
    (req) => !fileHeaders.some((fh) => fh.toLowerCase() === req.toLowerCase())
  );

  if (missing.length > 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: [`Invalid template. Missing required column(s): ${missing.join(", ")}.`],
    };
  }

  const getColIndex = (colName: string) =>
    fileHeaders.findIndex((h) => h.toLowerCase() === colName.toLowerCase());

  const idxName = getColIndex("Customer Name");
  const idxCustomerId = getColIndex("Customer ID");
  const idxCompany = getColIndex("Company Name");
  const idxCountry = getColIndex("Country");
  const idxContact = getColIndex("Contact Person");
  const idxEmail = getColIndex("Email");
  const idxPhone = getColIndex("Phone");
  const idxStatus = getColIndex("Status");

  const seenNames = new Set<string>();
  const validationErrors: string[] = [];
  const validatedInputs: CustomerInput[] = [];

  dataRows.forEach((row, i) => {
    if (!row || row.every((cell) => String(cell ?? "").trim() === "")) {
      return;
    }

    const rowNum = i + 2;
    const customerName = String(row[idxName] ?? "").trim();
    const email = idxEmail >= 0 ? String(row[idxEmail] ?? "").trim() : "";

    if (!customerName) {
      validationErrors.push(`Row ${rowNum}: Customer Name is missing.`);
      return;
    }

    const key = customerName.toLowerCase();

    if (seenNames.has(key)) {
      validationErrors.push(`Row ${rowNum}: Duplicate Customer Name "${customerName}" inside the file.`);
      return;
    }

    if (email && !EMAIL_PATTERN.test(email)) {
      validationErrors.push(`Row ${rowNum}: "${email}" is not a valid email address.`);
      return;
    }

    const rawStatus = idxStatus >= 0 ? String(row[idxStatus] ?? "").trim() : "";
    const status: "Active" | "Inactive" = rawStatus.toLowerCase() === "inactive" ? "Inactive" : "Active";

    seenNames.add(key);
    validatedInputs.push({
      customerId: idxCustomerId >= 0 ? String(row[idxCustomerId] ?? "").trim() : undefined,
      customerName,
      companyName: idxCompany >= 0 ? String(row[idxCompany] ?? "").trim() : undefined,
      country: idxCountry >= 0 ? String(row[idxCountry] ?? "").trim() : undefined,
      contactPerson: idxContact >= 0 ? String(row[idxContact] ?? "").trim() : undefined,
      email: email || undefined,
      phone: idxPhone >= 0 ? String(row[idxPhone] ?? "").trim() : undefined,
      status,
    });
  });

  if (validationErrors.length > 0) {
    return { imported: 0, skipped: 0, errors: validationErrors };
  }

  if (validatedInputs.length === 0) {
    return { imported: 0, skipped: 0, errors: ["No valid customer rows found to import."] };
  }

  try {
    const result = await apiClient.post<{ imported: number; skipped: number }>("/customers/import", {
      customers: validatedInputs.map((input) => toCustomerPayload(input)),
    });
    await fetchCustomersFromApi({ page: 1, pageSize: 1000, sortField: "customerName", sortDirection: "asc" });
    notifyCustomersChanged();
    return { imported: result.imported, skipped: result.skipped, errors: [] };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Import failed. Please try again.";
    return { imported: 0, skipped: 0, errors: [message] };
  }
}

export function downloadCustomerTemplate(): void {
  const headers = ["Customer Name", "Status"];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
  XLSX.writeFile(workbook, "Customer_Master_Template.xlsx");
}

const toExportRows = (customers: Customer[]) =>
  customers.map((customer, index) => ({
    "Sl No": index + 1,
    "Customer ID": customer.customerId || "",
    "Customer Name": customer.customerName,
    "Company Name": customer.companyName || "",
    Country: customer.country || "",
    "Contact Person": customer.contactPerson || "",
    Email: customer.email || "",
    Phone: customer.phone || "",
    Status: customer.status,
    "Created On": new Date(customer.createdAt).toLocaleDateString("en-IN"),
  }));

export function exportCustomers(customers: Customer[], format: "xlsx" | "csv" = "xlsx"): void {
  const worksheet = XLSX.utils.json_to_sheet(toExportRows(customers));

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Customer_Master.csv";
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
  XLSX.writeFile(workbook, "Customer_Master.xlsx");
}
