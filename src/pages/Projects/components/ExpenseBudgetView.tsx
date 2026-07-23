import type { Project } from "../../../types/Project";
import { Wallet, Receipt, PiggyBank, Calculator } from "lucide-react";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";
import { StatTile } from "../../../components/ui/StatTile";

interface Props {
  project: Project;
}

import { formatBusinessINR } from "../../../utils/formatCurrency";

const formatCurrency = (value: number): string => formatBusinessINR(value || 0);

export default function ExpenseBudgetView({ project }: Props) {
  const manhourBudgetAmount = project.manhourBudgetAmount || 0;
  const manhourBudgetHours = project.manhourBudgetHours || 0;
  const manhourBudgetRemarks = project.manhourBudgetRemarks || "";

  const nonManhourBudgetAmount = project.nonManhourBudgetAmount || 0;
  const nonManhourBudgetRemarks = project.nonManhourBudgetRemarks || "";

  const totalProjectBudget = project.workOrderValueINR || 0;
  const totalProjectCost = manhourBudgetAmount + nonManhourBudgetAmount;

  return (
    <InfoSection title="Expense Budget" icon={<PiggyBank size={16} />}>
      <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatTile label="Total Man-Hour Budget" value={formatCurrency(manhourBudgetAmount)} icon={<Wallet size={15} />} tint="accent" />
        <StatTile label="Total Non Man-Hour Budget" value={formatCurrency(nonManhourBudgetAmount)} icon={<Receipt size={15} />} tint="info" />
        <StatTile label="Total Project Budget" value={formatCurrency(totalProjectBudget)} icon={<PiggyBank size={15} />} tint="success" />
        <StatTile label="Total Project Cost" value={formatCurrency(totalProjectCost)} icon={<Calculator size={15} />} tint="warning" />
      </div>

      <InfoField label="Man-Hour Budget Hours" value={`${manhourBudgetHours.toLocaleString("en-IN")} Hrs`} />

      <InfoField label="Man-Hour Budget Remarks" value={manhourBudgetRemarks || "—"} />

      <div className="col-span-full border-t border-[var(--nu-border)]" />

      <InfoField label="Non Man-Hour Budget Remarks" value={nonManhourBudgetRemarks || "—"} />
    </InfoSection>
  );
}
