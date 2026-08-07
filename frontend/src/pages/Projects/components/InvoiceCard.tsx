import type { Dispatch, SetStateAction } from "react";
import { Receipt } from "lucide-react";

import type { Project } from "../../../types/Project";
import type { InvoiceMethod } from "../../../types/InvoiceItem";
import { Select } from "../../../components/ui/Select";
import { getInvoiceMethod } from "./Invoice/InvoiceCalculations";
import { InvoiceDashboard } from "./Invoice/InvoiceDashboard";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  /** Deep-linked from a notification — auto-expands this activity and pre-filters Invoice History to it. */
  initialActivityId?: string | null;
  /** Deep-linked from a notification — scrolls to and highlights this invoice line in Invoice History. */
  initialInvoiceLineId?: string | null;
}

const InvoiceCard = ({ project, setProject, initialActivityId, initialInvoiceLineId }: Props) => {
  const invoiceMethod = getInvoiceMethod(project);

  const handleInvoiceMethodChange = (value: string) => {
    setProject((prev) => ({
      ...prev,
      invoiceMethod:
        value === "invoice_line_items" || value === "lump_sum" || value === "mlmp" || value === "amount_based"
          ? (value as InvoiceMethod)
          : undefined,
    }));
  };

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-[var(--nu-border)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Receipt className="text-blue-600 dark:text-blue-400" size={22} />
          </div>

          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--nu-text)]">
              Invoice Management
            </h2>

            <p className="text-sm text-[var(--nu-text-muted)]">
              Raise, track, and review invoices against every activity — quantity, milestone, and amount billing, together.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="invoice-method" className="text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
            Invoice Method
          </label>
          <Select
            id="invoice-method"
            value={invoiceMethod ?? ""}
            onChange={(e) => handleInvoiceMethodChange(e.target.value)}
            className="w-[190px] sm:w-[260px]"
          >
            <option value="">Select Invoice Method</option>
            <option value="invoice_line_items">Quantity Based</option>
            <option value="lump_sum">Lump Sum</option>
            <option value="mlmp">Multiple Line Items – Multiple Payment Terms (MLMP)</option>
            <option value="amount_based">Amount Based</option>
          </Select>
        </div>
      </div>

      <div className="p-6">
        <InvoiceDashboard
          project={project}
          setProject={setProject}
          initialActivityId={initialActivityId}
          initialInvoiceLineId={initialInvoiceLineId}
        />
      </div>
    </div>
  );
};

export default InvoiceCard;
