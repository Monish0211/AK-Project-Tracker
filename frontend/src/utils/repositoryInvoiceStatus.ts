export type RepositoryInvoiceStatus = "Not Started" | "Partially Paid" | "Paid";

/**
 * Project Repository's Invoice Status / Pending Due rule — shared (Oct 2026) by the Repository list and Invoice
 * Tracker so the two can never disagree. It asks only "how much of the Work Order Value has been invoiced", using the
 * backend-authoritative workOrderValueINR / backendPendingDueINR already on every project returned by the API.
 *
 * NOTE for readers: despite the labels, this is invoiced share, NOT payment. "Paid" means the whole Work Order Value
 * has been invoiced (Draft lines included, Cancelled excluded — see the backend's invoiceRaisedFromLines()); it says
 * nothing about money received. Actual payment status is a per-invoice status (Raised / Partially Paid / Paid).
 */
export function repositoryInvoiceSummary(
  workOrderValueINR: number | undefined,
  backendPendingDueINR: number | undefined
): { pendingDue: number; invoiceStatus: RepositoryInvoiceStatus } {
  const workOrderValue = workOrderValueINR || 0;
  const pendingDue = typeof backendPendingDueINR === "number" ? backendPendingDueINR : workOrderValue;
  const invoiceRaised = Math.max(workOrderValue - pendingDue, 0);

  let invoiceStatus: RepositoryInvoiceStatus;
  if (invoiceRaised <= 0) {
    invoiceStatus = "Not Started";
  } else if (invoiceRaised >= workOrderValue) {
    invoiceStatus = "Paid";
  } else {
    invoiceStatus = "Partially Paid";
  }

  return { pendingDue, invoiceStatus };
}
