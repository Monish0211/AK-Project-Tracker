import { ExpenseCards } from "./ExpenseCards";
import { ExpenseCategoryChart } from "./ExpenseCategoryChart";
import { BudgetVsActual } from "./BudgetVsActual";
import { ExpenseLedger } from "./ExpenseLedger";

interface Props {
  projects: any[];
  analytics: any;
}

export function ExpenseAnalytics({ projects, analytics }: Props) {
  return (
    <div className="space-y-5 nu-fade-in">
      <ExpenseCards analytics={analytics} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExpenseCategoryChart projects={projects} />
        <BudgetVsActual projects={projects} />
      </div>

      <ExpenseLedger projects={projects} />
    </div>
  );
}
