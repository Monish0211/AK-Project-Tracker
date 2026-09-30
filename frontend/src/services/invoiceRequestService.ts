import { apiClient } from "./apiClient";
import type { EligibleInvoiceRaiser, InvoiceRequest } from "../types/InvoiceRequest";

/** Request Invoice workflow — thin wrapper over Backend's /projects/:projectId/invoice-requests routes, same one-function-per-endpoint convention as prRequestService.ts. */

export interface CreateInvoiceRequestPayload {
  assignedToUserId: string;
  invoiceAmountNote?: string | null;
  copiesRequired?: string | null;
  drawingsAvailable?: string | null;
  printingDetails?: string | null;
  address?: string | null;
  notes?: string | null;
}

export const createInvoiceRequest = (projectId: string, payload: CreateInvoiceRequestPayload): Promise<InvoiceRequest> =>
  apiClient.post<InvoiceRequest>(`/projects/${projectId}/invoice-requests`, payload);

/** No separate Invoice Requests page in this phase — used only to show "a request is already pending" / who it's assigned to inside the project's own Invoices tab. */
export const getInvoiceRequestsForProject = (projectId: string): Promise<InvoiceRequest[]> =>
  apiClient.get<InvoiceRequest[]>(`/projects/${projectId}/invoice-requests`);

/** Active users who currently hold the "Raise Invoice" approval permission — the only people eligible to be assigned a Request Invoice. */
export const getEligibleInvoiceRaisers = (): Promise<EligibleInvoiceRaiser[]> =>
  apiClient.get<EligibleInvoiceRaiser[]>("/users/eligible-invoice-raisers");
