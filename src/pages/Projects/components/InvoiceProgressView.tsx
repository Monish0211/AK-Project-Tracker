import type { Project } from "../../../types/Project";

import { InvoiceDashboard } from "./Invoice/InvoiceDashboard";

interface Props {
  project: Project;
}

const InvoiceProgressView = ({ project }: Props) => {
  return <InvoiceDashboard project={project} readOnly />;
};

export default InvoiceProgressView;
