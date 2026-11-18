import { DollarSign, Wallet, TrendingDown, CheckCircle2 } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { useReportMoney } from "../reportCurrencyContext";

interface Props {
  analytics: any;
}

export function ExpenseCards({ analytics }: Props) {
  const money = useReportMoney();
  const a = analytics;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <KPIReportCard
        title="Total Approved Budget"
        value={money.compact(a.totalBudget)}
        subtitle="Manhour + Non-manhour allocation"
        icon={<DollarSign size={18} />}
        tone="blue"
      />

      <KPIReportCard
        title="Actual Total Expenses"
        value={money.compact(a.totalExpenses)}
        subtitle={`Manhour: ${money.compact(a.totalManhourExpenses)} | Non-MH: ${money.compact(a.totalNonManhourExpenses)}`}
        icon={<Wallet size={18} />}
        tone="rose"
      />

      <KPIReportCard
        title="Remaining Budget"
        value={money.compact(a.remainingBudget)}
        subtitle="Available budget pool"
        trend={a.remainingBudget >= 0 ? "Under Budget" : "Overrun"}
        trendType={a.remainingBudget >= 0 ? "positive" : "negative"}
        icon={<TrendingDown size={18} />}
        tone="emerald"
      />

      <KPIReportCard
        title="Budget Utilization"
        value={`${a.totalBudget > 0 ? ((a.totalExpenses / a.totalBudget) * 100).toFixed(1) : 0}%`}
        subtitle="Expenses / Total Budget"
        icon={<CheckCircle2 size={18} />}
        tone="indigo"
      />
    </div>
  );
}
