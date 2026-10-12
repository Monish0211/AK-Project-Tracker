import { AlertTriangle } from "lucide-react";
import { Input } from "../../../../components/ui/Input";
import type { InvoiceNumberFieldState } from "./useInvoiceNumberField";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "bg-slate-100/70 dark:bg-slate-800/50 text-[var(--nu-text-secondary)] cursor-not-allowed";

/**
 * Manual invoice numbering (Oct 2026) — one header cell for the Raise
 * Invoice workspaces. Editable and required for a new invoice; read-only for
 * an existing invoice (its saved number is shown unchanged).
 */
export function InvoiceNumberField({ state }: { state: InvoiceNumberFieldState }) {
  const { isNew, value, setValue, error } = state;
  return (
    <div>
      <label className={labelClass}>Invoice No{isNew ? " *" : ""}</label>
      <Input
        type="text"
        value={value}
        disabled={!isNew}
        invalid={!!error}
        autoComplete="off"
        className={`font-mono ${isNew ? "" : disabledFieldClass}`}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && (
        <p className="mt-1 flex items-start gap-1 text-[10px] font-medium text-[var(--nu-danger)]">
          <AlertTriangle size={10} className="shrink-0 mt-[1px]" />
          {error}
        </p>
      )}
    </div>
  );
}
