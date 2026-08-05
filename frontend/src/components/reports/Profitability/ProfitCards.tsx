import { DollarSign, Percent, TrendingUp, TrendingDown } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { formatBusinessINR } from "../../../utils/formatCurrency";

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
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      let raised = 0;
      items.forEach((item: any) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status !== "Cancelled") raised += line.invoiceAmountINR || 0;
        });
      });
      const nonManhour = (p.nonManhourExpenses || []).reduce((acc: number, e: any) => acc + (e.totalCost || e.amount || 0), 0);
      const manhour = (p.manhourExpenses || []).reduce((acc: number, e: any) => acc + (e.totalCost || e.amount || 0), 0);
      const profit = raised - (nonManhour + manhour);
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
        value={`₹ ${formatBusinessINR(a.grossProfit)}`}
        subtitle="Raised Invoices - Total Expenses"
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
        value={`₹ ${formatBusinessINR(highestProj.profit)}`}
        subtitle={highestProj.title}
        trend="Top Performer"
        trendType="positive"
        icon={<TrendingUp size={18} />}
        tone="cyan"
      />

      <KPIReportCard
        title="Lowest Profit Contract"
        value={`₹ ${formatBusinessINR(lowestProj.profit)}`}
        subtitle={lowestProj.title}
        trend={lowestProj.profit < 0 ? "Loss Making" : "Lowest"}
        trendType={lowestProj.profit < 0 ? "negative" : "neutral"}
        icon={<TrendingDown size={18} />}
        tone="rose"
      />
    </div>
  );
}
