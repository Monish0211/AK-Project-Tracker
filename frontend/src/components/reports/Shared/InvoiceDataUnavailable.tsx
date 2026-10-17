import { Lock } from "lucide-react";
import { INVOICE_NOT_AVAILABLE } from "./invoiceAccess";

/** Replaces a chart, table or whole tab that is built only from invoice data, for viewers without invoice access. */
export function InvoiceDataUnavailable({ title, className = "" }: { title: string; className?: string }) {
  return (
    <div className={`bg-[var(--nu-surface)] border border-[var(--nu-border)] p-5 rounded-2xl shadow-xs ${className}`}>
      <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">{title}</h4>
      <div role="note" className="mt-4 flex items-center gap-2.5 rounded-xl border border-dashed border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-4 py-6 text-xs text-[var(--nu-text-muted)]">
        <Lock size={14} />
        <span>
          <strong className="text-[var(--nu-text)]">{INVOICE_NOT_AVAILABLE}</strong> — your account doesn't have access to invoice data, so this section can't be shown.
        </span>
      </div>
    </div>
  );
}
