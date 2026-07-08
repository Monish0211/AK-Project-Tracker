import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";

import {
  getGrossProfit,
  getProfitMargin,
  getTotalManhourCost,
  getTotalNonManhourCost,
  getTotalProjectCost,
} from "../../../services/expenseService";

interface Props {
  project: Project;
}

const formatINR = (value: number): string =>
  `₹ ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const CostSection = ({ project }: Props) => {
  const manhourCost = getTotalManhourCost(project.manhourExpenses);

  const nonManhourCost = getTotalNonManhourCost(project.nonManhourExpenses);

  const totalCost = getTotalProjectCost(
    project.manhourExpenses,
    project.nonManhourExpenses
  );

  const grossProfit = getGrossProfit(project.workOrderValue, totalCost);

  const profitMargin = getProfitMargin(project.workOrderValue, grossProfit);

  return (
    <InfoSection title="Expense Information">
      <InfoField
        label="Manhour Expenses"
        value={formatINR(manhourCost)}
      />

      <InfoField
        label="Non-Manhour Expenses"
        value={formatINR(nonManhourCost)}
      />

      <InfoField
        label="Total Expenses"
        value={formatINR(totalCost)}
      />

      <InfoField
        label="Profit"
        value={formatINR(grossProfit)}
      />

      <InfoField
        label="Profit Percentage"
        value={`${profitMargin.toFixed(2)} %`}
      />
    </InfoSection>
  );
};

export default CostSection;