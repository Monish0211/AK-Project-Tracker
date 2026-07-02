import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";

interface Props {
  project: Project;
}

const BusinessSection = ({ project }: Props) => {
  return (
    <InfoSection title="Commercial Information">
      <InfoField
        label="Contract Formalities"
        value={project.contractFormalities}
      />

      <InfoField
        label="Payment Terms"
        value={project.paymentTerms}
      />

      <InfoField
        label="Currency"
        value={project.currency}
      />

      <InfoField
        label="Work Order Value"
        value={`₹ ${project.workOrderValue.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />

      <InfoField
        label="Contract Exchange Rate"
        value={project.contractExchangeRate}
      />

      <InfoField
        label="Current Exchange Rate"
        value={project.currentExchangeRate}
      />

      <InfoField
        label="Work Order Value (INR)"
        value={`₹ ${project.workOrderValueINR.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />
    </InfoSection>
  );
};

export default BusinessSection;