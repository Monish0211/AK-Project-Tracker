import { useState } from "react";
import { History } from "lucide-react";

import type { Project } from "../../../types/Project";

import InvoiceSummaryCards from "./Invoice/InvoiceSummaryCards";
import InvoiceProgressTable from "./Invoice/InvoiceProgressTable";
import BillingHistoryModal from "./Invoice/BillingHistoryModal";
import { Button } from "../../../components/ui/Button";

interface Props {
  project: Project;
}

const InvoiceProgressView = ({ project }: Props) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  return (
    <div className="space-y-3.5">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" icon={<History size={13} />} onClick={() => setIsHistoryOpen(true)}>
          Billing History
        </Button>
      </div>

      <InvoiceSummaryCards project={project} />

      <InvoiceProgressTable project={project} />

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
