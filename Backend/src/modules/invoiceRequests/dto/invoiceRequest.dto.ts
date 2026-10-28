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

  /** CC Members (Oct 2026) — the PortalUsers persisted as CC recipients at submission time; follows this request through Raised and Paid. Never includes the mandatory addresses (those are server-injected, not PortalUser rows). */
  ccMembers: { id: string; fullName: string; email: string }[];

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

  /** Files uploaded with the request (names and sizes only — there is no portal download; they travel by email). */
  attachments: { id: string; fileName: string; fileSizeBytes: number }[];
  /**
   * Outcome of the notification email: pending | sent | sent_with_attachments | sent_without_attachments | failed | unconfirmed.
   * null = a request created before outcomes were recorded. "pending" means the email has not been attempted/finished yet — it
   * must NOT be read as "the responsible person was notified".
   */
  emailStatus: string | null;
  emailDetail: string | null;

  createdAt: Date;
  updatedAt: Date;
}

/** GET /users/eligible-invoice-raisers — minimal shape, same convention as PR Request's UserByRoleDto. */
export interface EligibleInvoiceRaiserDto {
  id: string;
  fullName: string;
}
