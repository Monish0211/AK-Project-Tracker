import type { AccessTokenPayload } from "../../shared/types/auth.types.js";
import { getUserDisplayName } from "../../shared/utils/userDisplayName.js";
import type { InvoiceAuditContext, InvoiceEventSource } from "./repository/invoiceStatusEvent.repository.js";

/**
 * The audit context for an invoice write: the authenticated user from the
 * verified access token (never a client-supplied id), their current display
 * name as a snapshot, and which operation this is. Invoice Tracker, Oct 2026.
 */
export async function buildInvoiceAudit(user: AccessTokenPayload, source: InvoiceEventSource): Promise<InvoiceAuditContext> {
  return { actorUserId: user.sub, actorName: await getUserDisplayName(user.sub), source };
}
