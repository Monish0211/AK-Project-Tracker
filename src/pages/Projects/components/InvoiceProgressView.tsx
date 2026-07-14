import { useState } from "react";
import { History } from "lucide-react";

import type { Project } from "../../../types/Project";

import InvoiceSummaryCards from "./Invoice/InvoiceSummaryCards";
import InvoiceProgressTable from "./Invoice/InvoiceProgressTable";
import BillingHistoryModal from "./Invoice/BillingHistoryModal";

interface Props {
  project: Project;
}

const InvoiceProgressView = ({ project }: Props) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setIsHistoryOpen(true)}
          className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-slate-700 px-4 py-2 rounded-xl transition"
        >
          <History size={16} />
          Billing History
        </button>
      </div>

      <InvoiceSummaryCards project={project} />

      <InvoiceProgressTable items={project.invoiceItems} />

      {isHistoryOpen && (
        <BillingHistoryModal
          project={project}
          onClose={() => setIsHistoryOpen(false)}
          readOnly
        />
      )}
    </div>
  );
};

export default InvoiceProgressView;
