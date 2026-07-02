import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";

interface Props {
  project: Project;
}

const CostSection = ({ project }: Props) => {
  return (
    <InfoSection title="Expense Information">
      <InfoField
        label="Manhour Expenses"
        value={`₹ ${project.manhourExpenses.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />

      <InfoField
        label="Non-Manhour Expenses"
        value={`₹ ${project.nonManhourExpenses.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />

      <InfoField
        label="Total Expenses"
        value={`₹ ${project.totalExpenses.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />

      <InfoField
        label="Profit"
        value={`₹ ${project.profit.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />

      <InfoField
        label="Profit Percentage"
        value={`${project.profitPercentage.toFixed(2)} %`}
      />
    </InfoSection>
  );
};

export default CostSection;