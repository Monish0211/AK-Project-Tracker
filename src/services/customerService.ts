// src/services/customerService.ts
import * as XLSX from "xlsx";

import type { Customer } from "../types/CustomerModel";
import { customerMasterData } from "../data/CustomerMasterData";

const STORAGE_KEY = "customers";

export function getCustomers(): Customer[] {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    return JSON.parse(stored);
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(customerMasterData)
  );

  return customerMasterData;
}

export function saveCustomers(customers: Customer[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(customers)
  );

  // Lets the Customer Master page (and any other live view) know customer
  // data changed, without introducing a new store or altering any calculation.
  // Reuses the same event the Dashboard already listens for.
  window.dispatchEvent(new Event("pmo:data-changed"));
}

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
}

export function addCustomer(input: CustomerInput): SaveCustomerResult {
  const customers = getCustomers();

  const exists = customers.some(
    (c) =>
      c.customerName.trim().toLowerCase() ===
      input.customerName.trim().toLowerCase()
  );

  if (exists) {
    return { success: false, message: "Customer already exists." };
  }

  const timestamp = new Date().toISOString();

  customers.push({
    id: crypto.randomUUID(),
    customerId: input.customerId?.trim() || undefined,
    customerName: input.customerName.trim(),
    companyName: input.companyName?.trim() || undefined,
    country: input.country?.trim() || undefined,
    contactPerson: input.contactPerson?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    status: input.status,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  saveCustomers(customers);

  return { success: true };
}

export function updateCustomer(id: string, input: CustomerInput): SaveCustomerResult {
  const customers = getCustomers();

  const duplicate = customers.some(
    (c) =>
      c.id !== id &&
      c.customerName.trim().toLowerCase() === input.customerName.trim().toLowerCase()
  );

  if (duplicate) {
    return { success: false, message: "Another customer already uses this name." };
  }

  const updated = customers.map((c) =>
    c.id === id
      ? {
          ...c,
          customerId: input.customerId?.trim() || undefined,
          customerName: input.customerName.trim(),
          companyName: input.companyName?.trim() || undefined,
          country: input.country?.trim() || undefined,
          contactPerson: input.contactPerson?.trim() || undefined,
          email: input.email?.trim() || undefined,
          phone: input.phone?.trim() || undefined,
          status: input.status,
          updatedAt: new Date().toISOString(),
        }
      : c
  );

  saveCustomers(updated);

  return { success: true };
}

export function deleteCustomer(id: string) {
  const customers = getCustomers().filter(
    (c) => c.id !== id
  );

  saveCustomers(customers);
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

export function bulkAddCustomers(inputs: CustomerInput[]): ImportResult {
  const customers = getCustomers();

  const existingNames = new Set(
    customers.map((c) => c.customerName.trim().toLowerCase())
  );

  let imported = 0;
  let skipped = 0;

  inputs.forEach((input) => {
    const name = input.customerName.trim();

    if (!name) {
      skipped += 1;
      return;
    }

    const key = name.toLowerCase();

    if (existingNames.has(key)) {
      skipped += 1;
      return;
    }

    existingNames.add(key);

    const timestamp = new Date().toISOString();

    customers.push({
      id: crypto.randomUUID(),
      customerId: input.customerId?.trim() || undefined,
      customerName: name,
      companyName: input.companyName?.trim() || undefined,
      country: input.country?.trim() || undefined,
      contactPerson: input.contactPerson?.trim() || undefined,
      email: input.email?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      status: input.status || "Active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    imported += 1;
  });

  saveCustomers(customers);

  return { imported, skipped };
}

const REQUIRED_HEADERS = ["Customer Name"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FileImportResult extends ImportResult {
  errors: string[];
}

/**
 * Accepts .xlsx or .csv. Mirrors the exact validation/abort pattern used by
 * the Projects import (required-header check, per-row duplicate/empty/format
 * checks, all-or-nothing abort with a capped error list on any failure).
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

  const existing = getCustomers();
  const seenNames = new Set<string>();
  const validationErrors: string[] = [];
  const validatedInputs: CustomerInput[] = [];

  dataRows.forEach((row, i) => {
    if (!row || row.every((cell) => String(cell ?? "").trim() === "")) {
      return; // skip blank rows
    }

    const rowNum = i + 2; // account for header row + 1-index
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

    if (existing.some((c) => c.customerName.trim().toLowerCase() === key)) {
      validationErrors.push(`Row ${rowNum}: Customer "${customerName}" already exists.`);
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

  const result = bulkAddCustomers(validatedInputs);

  return { ...result, errors: [] };
}

export function downloadCustomerTemplate(): void {
  // Matches the columns actually shown in the Customer Repository table.
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
