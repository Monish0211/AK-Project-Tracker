/**
 * Open | Completed — deliberately just two states (see InvoiceRequest in
 * schema.prisma). No Rejected/Cancelled in this phase — not asked for.
 */
export type InvoiceRequestStatus = "Open" | "Completed";

export interface InvoiceRequestDto {
  id: string;
  projectId: string;
  /** Read live from the linked Project — never duplicated onto InvoiceRequest itself. */
  projectPrNo: string;
  projectClient: string;
  projectTitle: string;
  /** Also read live from the linked Project (eicName/contactNumber/emailId — the Work Order Details "Client Contact" fields) — matches the team's existing manual invoice-request email template. */
  clientContactName: string | null;
  clientContactPhone: string | null;
  clientContactEmail: string | null;

  requestedByUserId: string;
  requestedByName: string;

  assignedToUserId: string;
  assignedToName: string;

  /** Free-text fields matching the team's existing manual "raise the invoice" email — all optional. */
  invoiceAmountNote: string | null;
  copiesRequired: string | null;
  drawingsAvailable: string | null;
  printingDetails: string | null;
  address: string | null;
  /** The manual template's "Special Note" row. */
  notes: string | null;

  status: InvoiceRequestStatus;
  fulfilledInvoiceLineId: string | null;

  createdAt: Date;
  updatedAt: Date;
}

/** GET /users/eligible-invoice-raisers — minimal shape, same convention as PR Request's UserByRoleDto. */
export interface EligibleInvoiceRaiserDto {
  id: string;
  fullName: string;
}
