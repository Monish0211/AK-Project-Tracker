/**
 * Invoice-data availability for every Reports tab (Oct 2026).
 *
 * useReportsData() learns from GET /invoice-items whether the viewer may read
 * invoice data (403 = no Invoices module). The backend remains the only
 * gatekeeper — no invoice rows ever reach a viewer without access; this
 * context only makes the UI say so honestly instead of showing ₹0, empty
 * bars or figures derived from "zero invoices". Loading and failed loads are
 * handled before any tab renders (ReportsPage only shows analytics once live
 * data is ready), so `false` here always means "no permission", never
 * "still loading" or "server error".
 */
import { createContext, useContext } from "react";

export const INVOICE_NOT_AVAILABLE = "Not available";
export const NO_INVOICE_ACCESS_HINT = "No invoice access";

export const InvoiceAccessContext = createContext<boolean>(true);

/** true = invoice figures are real (a zero is a genuine zero); false = the viewer has no invoice access. */
export function useInvoiceDataAvailable(): boolean {
  return useContext(InvoiceAccessContext);
}
