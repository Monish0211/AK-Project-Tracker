import type { Invoice } from "../types/Invoice";

const STORAGE_KEY = "ifluids-invoices";

/* ===================================================
   GET ALL INVOICES
=================================================== */

export const getInvoices = (): Invoice[] => {
  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) return [];

  return JSON.parse(data);
};

/* ===================================================
   SAVE ALL INVOICES
=================================================== */

const saveInvoices = (
  invoices: Invoice[]
): void => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(invoices)
  );

  // Lets the Dashboard (and any other live view) know invoice/payment data
  // changed, without introducing a new store or altering any calculation.
  window.dispatchEvent(new Event("pmo:data-changed"));
};

/* ===================================================
   ADD INVOICE
=================================================== */

export const addInvoice = (
  invoice: Invoice
): void => {
  const invoices = getInvoices();

  invoices.push(invoice);

  saveInvoices(invoices);
};

/* ===================================================
   UPDATE INVOICE
=================================================== */

export const updateInvoice = (
  updatedInvoice: Invoice
): void => {
  const invoices = getInvoices();

  const updatedInvoices = invoices.map((invoice) =>
    invoice.id === updatedInvoice.id
      ? updatedInvoice
      : invoice
  );

  saveInvoices(updatedInvoices);
};

/* ===================================================
   DELETE INVOICE
=================================================== */

export const deleteInvoice = (
  id: string
): void => {
  const invoices = getInvoices().filter(
    (invoice) => invoice.id !== id
  );

  saveInvoices(invoices);
};

/* ===================================================
   GET INVOICE BY ID
=================================================== */

export const getInvoiceById = (
  id: string
): Invoice | undefined => {
  return getInvoices().find(
    (invoice) => invoice.id === id
  );
};

/* ===================================================
   GENERATE INVOICE REFERENCE
=================================================== */

export const generateInvoiceRef = (
  prNo: string
): string => {
  const invoices = getInvoices().filter(
    (invoice) => invoice.prNo === prNo
  );

  const nextNumber = invoices.length + 1;

  return `${prNo}-INV-${String(
    nextNumber
  ).padStart(2, "0")}`;
};