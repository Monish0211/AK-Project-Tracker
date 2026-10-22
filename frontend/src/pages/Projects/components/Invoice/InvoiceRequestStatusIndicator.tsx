import { AlertTriangle, Paperclip, Send } from "lucide-react";
import type { InvoiceRequest } from "../../../../types/InvoiceRequest";
import { Badge } from "../../../../components/ui/Badge";
import { emailOutcomeNote } from "../../../../utils/invoiceRequestAttachments";

interface Props {
  /** The currently Open InvoiceRequest for this project, or null if none — see InvoiceDashboard.tsx's own fetch. */
  invoiceRequest: InvoiceRequest | null;
}

/**
 * Request Invoice workflow — lifecycle indicator (Oct 2026). A pure status
 * display, never a `<button>` and never wired to an onClick.
 *
 * Invoice Request is only the approval/request stage: "an invoice has been
 * requested and is waiting for Accounts to process." Once Accounts raises
 * it (any transition out of Draft), that request is fulfilled/Completed and
 * this indicator has nothing left to say — Invoice Summary / Invoice
 * History already own showing the real Raised/Partially Paid/Paid status.
 * So this renders "Invoice Requested" while genuinely Open, and nothing at
 * all otherwise (Completed, Cancelled, or no request).
 */
export function InvoiceRequestStatusIndicator({ invoiceRequest }: Props) {
  if (!invoiceRequest || invoiceRequest.status !== "Open") return null;

  const hasAttachments = (invoiceRequest.attachments?.length ?? 0) > 0;
  const emailNote = emailOutcomeNote(invoiceRequest.emailStatus, hasAttachments);

  return (
    <>
      <Badge tone="info">
        <Send size={11} />
        Invoice Requested
      </Badge>
      {/* Attachment / email outcome (Oct 2026). Shown only when there is something worth knowing — a normal "sent" request shows
          nothing extra, exactly as before. The tooltip carries the server's plain-language detail. */}
      {emailNote && (
        <span title={invoiceRequest.emailDetail ?? undefined}>
          <Badge tone={emailNote.tone}>
            {emailNote.tone === "neutral" ? <Paperclip size={11} /> : <AlertTriangle size={11} />}
            {emailNote.label}
          </Badge>
        </span>
      )}
    </>
  );
}
