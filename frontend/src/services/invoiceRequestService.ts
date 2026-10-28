import { apiClient } from "./apiClient";
import type { EligibleInvoiceRaiser, InvoiceRequest } from "../types/InvoiceRequest";

/** Request Invoice workflow — thin wrapper over Backend's /projects/:projectId/invoice-requests routes, same one-function-per-endpoint convention as prRequestService.ts. */

export interface CreateInvoiceRequestPayload {
  assignedToUserId: string;
  /** CC Members — selected PortalUser ids, re-validated server-side. The mandatory arun@ifluids.com and accounts@ifluids.com are never sent here — they're server-injected. */
  ccMemberUserIds?: string[];
  /** Additional CC Email Addresses — free-typed addresses (people outside the PMO user list). Re-validated server-side; for the notification email only. Omit when none. */
  additionalCcEmails?: string[];
  invoiceAmountNote?: string | null;
  copiesRequired?: string | null;
  drawingsAvailable?: string | null;
  printingDetails?: string | null;
  address?: string | null;
  notes?: string | null;
}

/** A 20 MB upload on a slow connection can take a while — well beyond the 30 s default used for ordinary JSON calls. */
const UPLOAD_TIMEOUT_MS = 180_000;

/** The multipart body for a request with files: the same JSON the plain request sends, as one "payload" field, plus the files. */
export function buildInvoiceRequestFormData(payload: CreateInvoiceRequestPayload, files: readonly File[]): FormData {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  for (const file of files) form.append("files", file, file.name);
  return form;
}

/**
 * Without files this is exactly the JSON request it has always been. With files it is one multipart request (payload + files), so
 * the request, its attachments and the notification email are all handled by the backend as a single submission.
 */
export const createInvoiceRequest = (projectId: string, payload: CreateInvoiceRequestPayload, files: readonly File[] = []): Promise<InvoiceRequest> =>
  files.length === 0
    ? apiClient.post<InvoiceRequest>(`/projects/${projectId}/invoice-requests`, payload)
    : apiClient.postFormData<InvoiceRequest>(`/projects/${projectId}/invoice-requests`, buildInvoiceRequestFormData(payload, files), { timeoutMs: UPLOAD_TIMEOUT_MS });

/** No separate Invoice Requests page in this phase — used only to show "a request is already pending" / who it's assigned to inside the project's own Invoices tab. */
export const getInvoiceRequestsForProject = (projectId: string): Promise<InvoiceRequest[]> =>
  apiClient.get<InvoiceRequest[]>(`/projects/${projectId}/invoice-requests`);

/** Active users who currently hold the "Raise Invoice" approval permission — the only people eligible to be assigned a Request Invoice. */
export const getEligibleInvoiceRaisers = (): Promise<EligibleInvoiceRaiser[]> =>
  apiClient.get<EligibleInvoiceRaiser[]>("/users/eligible-invoice-raisers");
