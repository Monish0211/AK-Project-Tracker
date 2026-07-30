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
}

const InvoiceCard = ({ project, setProject }: Props) => {
  const invoiceMethod = getInvoiceMethod(project);

  const handleInvoiceMethodChange = (value: InvoiceMethod) => {
    setProject((prev) => ({ ...prev, invoiceMethod: value }));
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
              Raise, track, and review invoices against every activity — quantity and milestone billing, together.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="invoice-method" className="text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
            Invoice Method
          </label>
          <Select
            id="invoice-method"
            value={invoiceMethod}
            onChange={(e) => handleInvoiceMethodChange(e.target.value as InvoiceMethod)}
            className="w-[190px]"
          >
            <option value="lump_sum">Lump Sum</option>
            <option value="invoice_line_items">Invoice Line Items</option>
          </Select>
        </div>
      </div>

      <div className="p-6">
        <InvoiceDashboard project={project} setProject={setProject} />
      </div>
    </div>
  );
};

export default InvoiceCard;
