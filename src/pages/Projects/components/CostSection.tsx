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

import { formatBusinessINR, formatFullINR } from "../../../utils/formatCurrency";

const CostSection = ({ project }: Props) => {
  const manhourCost = getTotalManhourCost(project.manhourExpenses);

  const nonManhourCost = getTotalNonManhourCost(project.nonManhourExpenses);

  const totalCost = getTotalProjectCost(
    project.manhourExpenses,
    project.nonManhourExpenses
  );

  const grossProfit = getGrossProfit(project.workOrderValueINR || 0, totalCost);

  const profitMargin = getProfitMargin(project.workOrderValueINR || 0, grossProfit);

  return (
    <InfoSection title="Expense Information">
      <InfoField
        label="Manhour Expenses"
        value={formatBusinessINR(manhourCost)}
        title={formatFullINR(manhourCost)}
      />

      <InfoField
        label="Non-Manhour Expenses"
        value={formatBusinessINR(nonManhourCost)}
        title={formatFullINR(nonManhourCost)}
      />

      <InfoField
        label="Total Expenses"
        value={formatBusinessINR(totalCost)}
        title={formatFullINR(totalCost)}
      />

      <InfoField
        label="Profit"
        value={formatBusinessINR(grossProfit)}
        title={formatFullINR(grossProfit)}
      />

      <InfoField
        label="Profit Percentage"
        value={`${profitMargin.toFixed(2)} %`}
      />
    </InfoSection>
  );
};

export default CostSection;