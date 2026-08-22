import { DollarSign, Percent, TrendingUp, TrendingDown } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { getTotalNonManhourCost } from "../../../services/expenseService";

interface Props {
  projects: any[];
  analytics: any;
}

export function ProfitCards({ projects, analytics }: Props) {
  const a = analytics;

  // Calculate highest & lowest profit projects
  let highestProj = { title: "N/A", profit: 0 };
  let lowestProj = { title: "N/A", profit: 0 };

  if (projects.length > 0) {
    const list = projects.map((p) => {
      const woVal = p.workOrderValueINR ?? p.workOrderValue ?? 0;
      const nonManhour = getTotalNonManhourCost(p.nonManhourExpenses || []);
      const manhour = (p.resources || []).reduce((acc: number, r: any) => acc + (r.manhourCost || 0), 0);
      const actualCost = nonManhour + manhour;
      const profit = woVal - actualCost;
      return { title: p.prNo || p.projectTitle || "Project", profit };
    });

    list.sort((x, y) => y.profit - x.profit);
    highestProj = list[0] || highestProj;
    lowestProj = list[list.length - 1] || lowestProj;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <KPIReportCard
        title="Gross Net Profit"
        value={formatBusinessINR(a.grossProfit)}
        subtitle="Work Order Value - Actual Cost"
        icon={<DollarSign size={18} />}
        tone="emerald"
      />

      <KPIReportCard
        title="Net Margin %"
        value={`${a.profitMarginPercent.toFixed(1)}%`}
        subtitle="Average Portfolio Margin"
        trend={a.profitMarginPercent >= 20 ? "Profitable" : "Low Margin"}
        trendType={a.profitMarginPercent >= 20 ? "positive" : "negative"}
        icon={<Percent size={18} />}
        tone="indigo"
      />

      <KPIReportCard
        title="Highest Profit Contract"
        value={formatBusinessINR(highestProj.profit)}
        subtitle={highestProj.title}
        trend="Top Performer"
        trendType="positive"
        icon={<TrendingUp size={18} />}
        tone="cyan"
      />

      <KPIReportCard
        title="Lowest Profit Contract"
        value={formatBusinessINR(lowestProj.profit)}
        subtitle={lowestProj.title}
        trend={lowestProj.profit < 0 ? "Loss Making" : "Lowest"}
        trendType={lowestProj.profit < 0 ? "negative" : "neutral"}
        icon={<TrendingDown size={18} />}
        tone="rose"
      />
    </div>
  );
}
