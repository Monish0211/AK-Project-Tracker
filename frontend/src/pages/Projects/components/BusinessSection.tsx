import type { Project } from "../../../types/Project";
import { formatMoney, regionalCurrencyOf, regionalWorkOrderValue } from "../../../utils/currencyDisplay";
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

      {project.regionalCurrency && project.regionalCurrency !== project.currency && (
        <InfoField label="Regional Currency" value={project.regionalCurrency} />
      )}

      <InfoField
        label="Currency"
        value={project.currency}
      />

      <InfoField
        label="Work Order Value"
        value={`${project.currency || "INR"} ${project.workOrderValue.toLocaleString("en-IN", {
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
        label={`Work Order Value (${regionalCurrencyOf(project)})`}
        value={formatMoney(regionalWorkOrderValue(project), regionalCurrencyOf(project))}
      />
    </InfoSection>
  );
};

export default BusinessSection;