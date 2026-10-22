/**
 * Request Invoice workflow (Sept 2026) — frontend mirror of the backend's
 * InvoiceRequestDto (Backend/src/modules/invoiceRequests/dto/invoiceRequest.dto.ts).
 * Deliberately does NOT duplicate Client Name/Project Name/PR Number as
 * separate editable fields — they ride along read-only, sourced live from
 * the linked Project.
 */

export type InvoiceRequestStatus = "Open" | "Completed";

export interface InvoiceRequest {
  id: string;
  projectId: string;
  projectPrNo: string;
  projectClient: string;
  projectTitle: string;
  /** Read live from the linked Project (eicName/contactNumber/emailId) — matches the team's existing manual invoice-request email template. */
  clientContactName: string | null;
  clientContactPhone: string | null;
  clientContactEmail: string | null;

  requestedByUserId: string;
  requestedByName: string;

  assignedToUserId: string;
  assignedToName: string;

  /** CC Members — the PortalUsers persisted as CC recipients at submission time; follows this request through Raised and Paid. Never includes the mandatory info@ifluids.com (server-injected, not a selectable user). */
  ccMembers: { id: string; fullName: string; email: string }[];

  invoiceAmountNote: string | null;
  copiesRequired: string | null;
  drawingsAvailable: string | null;
  printingDetails: string | null;
  address: string | null;
  notes: string | null;

  status: InvoiceRequestStatus;
  fulfilledInvoiceLineId: string | null;

  /** Files uploaded with the request — names and sizes only. They travel by email; the portal offers no download. */
  attachments: { id: string; fileName: string; fileSizeBytes: number }[];
  /**
   * Outcome of the notification email: pending | sent | sent_with_attachments | sent_without_attachments | failed | unconfirmed.
   * null = a request created before outcomes were recorded. "pending" does NOT mean the person was notified yet.
   */
  emailStatus: string | null;
  emailDetail: string | null;

  createdAt: string;
  updatedAt: string;
}

/** GET /users/eligible-invoice-raisers response row. */
export interface EligibleInvoiceRaiser {
  id: string;
  fullName: string;
}
