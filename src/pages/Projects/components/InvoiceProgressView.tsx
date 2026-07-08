import type { Project } from "../../../types/Project";

import InvoiceSummaryCards from "./Invoice/InvoiceSummaryCards";
import InvoiceProgressTable from "./Invoice/InvoiceProgressTable";

interface Props {
  project: Project;
}

const InvoiceProgressView = ({ project }: Props) => {
  return (
    <div className="space-y-6">
      <InvoiceSummaryCards
        workOrderValueINR={project.workOrderValueINR}
        invoiceItems={project.invoiceItems}
        collectionReceived={project.paymentReceived}
      />

      <InvoiceProgressTable items={project.invoiceItems} readOnly />
    </div>
  );
};

export default InvoiceProgressView;
