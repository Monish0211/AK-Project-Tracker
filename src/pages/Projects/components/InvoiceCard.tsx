import type { Dispatch, SetStateAction } from "react";
import { Receipt } from "lucide-react";

import type { Project } from "../../../types/Project";
import { InvoiceDashboard } from "./Invoice/InvoiceDashboard";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const InvoiceCard = ({ project, setProject }: Props) => {
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
      </div>

      <div className="p-6">
        <InvoiceDashboard project={project} setProject={setProject} />
      </div>
    </div>
  );
};

export default InvoiceCard;
