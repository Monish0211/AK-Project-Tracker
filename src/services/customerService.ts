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
}

export function addCustomer(name: string): boolean {
  const customers = getCustomers();

  const exists = customers.some(
    (c) =>
      c.customerName.toLowerCase() ===
      name.toLowerCase()
  );

  if (exists) return false;

  customers.push({
    id: crypto.randomUUID(),
    customerName: name,
    status: "Active",
    createdAt: new Date().toISOString(),
  });

  saveCustomers(customers);

  return true;
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

export function bulkAddCustomers(names: string[]): ImportResult {
  const customers = getCustomers();

  const existingNames = new Set(
    customers.map((c) => c.customerName.trim().toLowerCase())
  );

  let imported = 0;
  let skipped = 0;

  names.forEach((rawName) => {
    const name = rawName.trim();

    if (!name) {
      return;
    }

    const key = name.toLowerCase();

    if (existingNames.has(key)) {
      skipped += 1;
      return;
    }

    existingNames.add(key);

    customers.push({
      id: crypto.randomUUID(),
      customerName: name,
      status: "Active",
      createdAt: new Date().toISOString(),
    });

    imported += 1;
  });

  saveCustomers(customers);

  return { imported, skipped };
}

export async function importCustomersFromExcel(
  file: File
): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, { type: "array" });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { imported: 0, skipped: 0 };
  }

  const worksheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
  });

  if (rows.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  const [headerRow, ...dataRows] = rows;

  const columnIndex = headerRow.findIndex(
    (header) => String(header).trim().toLowerCase() === "customer name"
  );

  if (columnIndex === -1) {
    return { imported: 0, skipped: 0 };
  }

  const names = dataRows.map((row) =>
    String(row[columnIndex] ?? "")
  );

  return bulkAddCustomers(names);
}

export function exportCustomersToExcel(customers: Customer[]) {
  const rows = customers.map((customer, index) => ({
    "Sl No": index + 1,
    "Customer Name": customer.customerName,
    Status: customer.status,
    "Created On": new Date(customer.createdAt).toLocaleDateString("en-IN"),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");

  XLSX.writeFile(workbook, "Customer_Master.xlsx");
}