import type { Project } from "../types/Project";

export function calculateInvoice(project: Project) {
  // ==========================
  // Invoice Raised
  // ==========================

  const invoiceRaisedINR =
    project.invoiceRaised * project.contractExchangeRate;

  // ==========================
  // Balance To Be Raised
  // ==========================

  const balanceToBeRaised = Math.max(
    project.workOrderValue - project.invoiceRaised,
    0
  );

  const balanceToBeRaisedINR = Math.max(
    project.workOrderValueINR - invoiceRaisedINR,
    0
  );

  // ==========================
  // Payment Received
  // ==========================

  const paymentReceivedINR =
    project.paymentReceived * project.contractExchangeRate;

  // ==========================
  // Outstanding
  // ==========================

  const outstanding = Math.max(
    project.invoiceRaised - project.paymentReceived,
    0
  );

  const outstandingINR = Math.max(
    invoiceRaisedINR - paymentReceivedINR,
    0
  );

  // ==========================
  // Payment Status
  // ==========================

  let paymentStatus = "Not Started";

  if (project.invoiceRaised > 0) {
    paymentStatus = "Unpaid";
  }

  if (
    project.paymentReceived > 0 &&
    outstanding > 0
  ) {
    paymentStatus = "Partially Paid";
  }

  if (
    project.invoiceRaised > 0 &&
    outstanding === 0
  ) {
    paymentStatus = "Paid";
  }

  // ==========================
  // Return
  // ==========================

  return {
    invoiceRaisedINR,

    balanceToBeRaised,
    balanceToBeRaisedINR,

    paymentReceivedINR,

    outstanding,
    outstandingINR,

    paymentStatus,
  };
}