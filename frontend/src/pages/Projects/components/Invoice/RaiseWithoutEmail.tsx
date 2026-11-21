import { MailX } from "lucide-react";
import type { RaiseWithoutEmailState } from "./useRaiseWithoutEmail";

/** Administrative Controls - the "Raise invoice without sending email" switch and drawer reminder (state: useRaiseWithoutEmail.ts). */
/** The switch itself. `draftInvoiceCount` (when known) says how many Draft invoices could be raised from this screen. */
export function RaiseWithoutEmailSwitch({ state, draftInvoiceCount }: { state: RaiseWithoutEmailState; draftInvoiceCount?: number | undefined }) {
  if (!state.available) return null;
  const on = state.enabled;
  return (
    <label
      className={`flex flex-wrap items-center gap-2 px-3.5 py-2.5 rounded-[var(--nu-radius-md)] border text-[12px] cursor-pointer ${
        on ? "border-amber-500/50 bg-amber-500/10 text-[var(--nu-text)]" : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-secondary)]"
      }`}
      data-testid="raise-without-email"
      data-on={on}
    >
      <input type="checkbox" checked={on} onChange={(e) => state.setEnabled(e.target.checked)} aria-label="Raise invoice without sending email" />
      <MailX size={14} className={on ? "text-amber-600" : "text-[var(--nu-text-muted)]"} aria-hidden="true" />
      <span className="font-semibold">Raise invoice without sending email</span>
      <span className="text-[11px] text-[var(--nu-text-muted)]">
        {on
          ? `ON - applies to every invoice raised in your next save (the "Invoice Raised Successfully" email, and the "Invoice Paid" email for a Draft raised straight to Paid, are not sent; the requester still gets the in-app notice). Saves that raise nothing keep it on.${
              draftInvoiceCount !== undefined ? ` Draft invoices that could be raised here: ${draftInvoiceCount}.` : ""
            }`
          : "Administrator option. Numbering, amounts, GST, settlement and request fulfilment are unchanged."}
      </span>
    </label>
  );
}

/** A reminder inside the invoice drawer while the option is on, so the user sees it at the moment of saving. */
export function RaiseWithoutEmailNotice({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-[var(--nu-radius-md)] border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-[var(--nu-text)]" data-testid="raise-without-email-notice">
      <MailX size={14} className="text-amber-600" aria-hidden="true" />
      Raise without sending email is ON: invoices raised by this save will not send the automatic email.
    </div>
  );
}
