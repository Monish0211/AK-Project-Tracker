import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";

interface Props {
  project: Project;
}

const formatCurrencyValue = (value: number): string =>
  `₹ ${(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const GeneralView = ({ project }: Props) => {
  return (
    <InfoSection title="General Information">
      <InfoField
        label="Client"
        value={project.client}
      />

      <InfoField
        label="Project Title"
        value={project.projectTitle}
      />

      <InfoField
        label="PR Category"
        value={project.prCategory}
      />

      <InfoField
        label="PR Number"
        value={project.prNo}
      />

      <InfoField
        label="Department"
        value={project.department}
      />

      <InfoField
        label="Domestic / Foreign"
        value={project.domesticForeign}
      />

      <InfoField
        label="Project Status"
        value={project.projectStatus}
      />

      <InfoField
        label="Work Order Status"
        value={project.workOrderStatus}
      />

      <InfoField
        label="Project Start Date"
        value={project.projectStartDate}
      />

      <InfoField
        label="Project End Date"
        value={project.projectEndDate}
      />

      <InfoField
        label="Contract Type"
        value={project.contractType || "LUMP SUM"}
      />
      <InfoField
        label="Currency"
        value={project.currency}
      />

      <InfoField
        label="Contract Formalities"
        value={project.contractFormalities}
      />

      <InfoField
        label="Payment Terms"
        value={project.paymentTerms}
      />

      <InfoField
        label="Contract Exchange Rate"
        value={project.contractExchangeRate || null}
      />

      <InfoField
        label="Current Exchange Rate"
        value={project.currentExchangeRate || null}
      />

      <InfoField
        label="Work Order Value"
        value={formatCurrencyValue(project.workOrderValue)}
      />
    </InfoSection>
  );
};

export default GeneralView;