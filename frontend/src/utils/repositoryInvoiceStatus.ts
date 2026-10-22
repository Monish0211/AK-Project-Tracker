export type RepositoryInvoiceStatus = "Not Started" | "Partially Paid" | "Paid";

/**
 * Project Repository's Invoice Status / Pending Due rule — shared (Oct 2026) by the Repository list and Invoice
 * Tracker so the two can never disagree. It asks only "how much of the Work Order Value has been invoiced", using the
 * backend-authoritative workOrderValueINR / backendPendingDueINR already on every project returned by the API.
 *
 * Not Started = nothing invoiced. Partially Paid = part of the Work Order Value invoiced, OR the whole value invoiced while any
 * non-Cancelled invoice is not yet Paid (Draft lines count as invoiced, Cancelled are ignored — see the backend's
 * invoiceRaisedFromLines()). Paid = the whole Work Order Value invoiced AND every non-Cancelled invoice actually marked Paid
 * (`allInvoicesPaid`, computed by the server from the invoice lines). Fully invoiced alone is never "Paid" once that is supplied.
 *
 * `allInvoicesPaid` is optional on purpose: a caller that has no per-invoice information (the Invoice Tracker list) omits it and
 * keeps the original invoiced-share rule unchanged. The Project Repository always supplies it explicitly.
 */
export function repositoryInvoiceSummary(
  workOrderValueINR: number | undefined,
  backendPendingDueINR: number | undefined,
  allInvoicesPaid?: boolean
): { pendingDue: number; invoiceStatus: RepositoryInvoiceStatus } {
  const workOrderValue = workOrderValueINR || 0;
  const pendingDue = typeof backendPendingDueINR === "number" ? backendPendingDueINR : workOrderValue;
  const invoiceRaised = Math.max(workOrderValue - pendingDue, 0);

  let invoiceStatus: RepositoryInvoiceStatus;
  if (invoiceRaised <= 0) {
    invoiceStatus = "Not Started";
  } else if (invoiceRaised >= workOrderValue && allInvoicesPaid !== false) {
    invoiceStatus = "Paid";
  } else {
    invoiceStatus = "Partially Paid";
  }

  return { pendingDue, invoiceStatus };
}
