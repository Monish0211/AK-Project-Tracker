import type { Project } from "../../../../types/Project";
import type { InvoiceGstSelection } from "../../../../types/InvoiceItem";
import { Button } from "../../../../components/ui/Button";
import { Portal } from "../../../../components/ui/Portal";
import { getInvoiceCycleCurrency } from "./invoiceCurrency";
import { InvoiceGstSelector } from "./InvoiceGstSelector";
import { useInvoiceGstChoice } from "./useInvoiceGstChoice";

interface Props {
  project: Project;
  invoiceNo: string;
  onCancel: () => void;
  /** Called with the complete choice; the caller then raises the invoice with it. */
  onConfirm: (selection: InvoiceGstSelection) => void;
}

/**
 * Invoice-level GST snapshot (Nov 2026) — shown when an invoice is raised straight from the Invoice History status control (Draft ->
 * Raised): the rate and tax type must be chosen at that moment, because they are fixed once the invoice is raised.
 */
export function InvoiceGstChoiceDialog({ project, invoiceNo, onCancel, onConfirm }: Props) {
  const choice = useInvoiceGstChoice(project, invoiceNo, getInvoiceCycleCurrency(project, invoiceNo)?.currency ?? "INR");
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Choose GST before raising the invoice">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-[var(--nu-surface)] p-5 shadow-2xl">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Raise invoice {invoiceNo}</h3>
          <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
            Choose the GST for this invoice. The rate and tax type are fixed once it is raised and are then used when its payment is recorded.
          </p>
          <div className="mt-3">
            <InvoiceGstSelector choice={choice} status="Raised" />
          </div>
          <div className="mt-4 flex justify-end gap-2.5">
            <Button variant="secondary" onClick={onCancel} className="px-4 py-2">
              Cancel
            </Button>
            <Button variant="primary" onClick={() => choice.selection && onConfirm(choice.selection)} disabled={!choice.selection} className="px-5 py-2 disabled:cursor-not-allowed disabled:opacity-50">
              Raise Invoice
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
