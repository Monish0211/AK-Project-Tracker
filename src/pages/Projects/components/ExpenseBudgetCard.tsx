import type { Dispatch, SetStateAction } from "react";
import { Briefcase, Clock, FileText, IndianRupee, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import type { Project } from "../../../types/Project";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { StatTile } from "../../../components/ui/StatTile";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const labelClass = "block text-[11.5px] font-medium text-[var(--nu-text-secondary)] mb-1.5";

export default function ExpenseBudgetCard({ project, setProject }: Props) {
  const manhourBudgetAmount = project.manhourBudgetAmount || 0;
  const manhourBudgetHours = project.manhourBudgetHours || 0;
  const manhourBudgetRemarks = project.manhourBudgetRemarks || "";

  const nonManhourBudgetAmount = project.nonManhourBudgetAmount || 0;
  const nonManhourBudgetRemarks = project.nonManhourBudgetRemarks || "";

  const totalProjectBudget = project.workOrderValueINR || 0;
  const totalProjectCost = manhourBudgetAmount + nonManhourBudgetAmount;

  const formatINR = (value: number) => formatBusinessINR(value || 0);

  const formatK = (value: number) => {
    if (value === 0) return "₹0";
    const kVal = value / 1000;
    const formatted = kVal % 1 === 0 ? kVal.toFixed(0) : kVal.toFixed(1);
    return `₹${formatted}K`;
  };

  const budgetedProfitAmount = totalProjectBudget - totalProjectCost;
  const budgetedProfitPercent = totalProjectBudget > 0 ? (budgetedProfitAmount / totalProjectBudget) * 100 : 0;

  const formattedProfitAmount = formatBusinessINR(budgetedProfitAmount);

  const formattedProfitPercent = `${budgetedProfitPercent.toFixed(2)} %`;

  let profitIconTintClass = "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]";
  let profitAmountTextClass = "text-[var(--nu-text)]";
  let profitPercentTextClass = "text-[var(--nu-text-secondary)]";
  let profitIcon = <TrendingUp size={14} />;

  if (budgetedProfitAmount > 0) {
    profitIconTintClass = "bg-[var(--nu-success-soft)] text-[var(--nu-success)]";
    profitAmountTextClass = "text-[var(--nu-success)]";
    profitPercentTextClass = "text-[var(--nu-success)] font-semibold";
    profitIcon = <TrendingUp size={14} />;
  } else if (budgetedProfitAmount < 0) {
    profitIconTintClass = "bg-[var(--nu-danger-soft)] text-[var(--nu-danger)]";
    profitAmountTextClass = "text-[var(--nu-danger)]";
    profitPercentTextClass = "text-[var(--nu-danger)] font-semibold";
    profitIcon = <TrendingDown size={14} />;
  } else {
    // Zero Profit
    profitIconTintClass = "bg-[var(--nu-accent-soft)] text-[var(--nu-info)]";
    profitAmountTextClass = "text-[var(--nu-text)]";
    profitPercentTextClass = "text-[var(--nu-text-muted)]";
    profitIcon = <TrendingUp size={14} />;
  }

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <StatTile
          emphasis="secondary"
          label="Man-Hour Budget"
          value={formatINR(manhourBudgetAmount)}
          icon={<Clock size={14} />}
          tint="accent"
        />
        <StatTile
          emphasis="secondary"
          label="Non Man-Hour Budget"
          value={formatINR(nonManhourBudgetAmount)}
          icon={<FileText size={14} />}
          tint="info"
        />
        <StatTile
          emphasis="secondary"
          label="Total Project Budget (WO)"
          value={formatINR(totalProjectBudget)}
          icon={<IndianRupee size={14} />}
          tint="success"
        />
        {/* Total Project Cost Card */}
        <div
          className="relative bg-[var(--nu-surface)] border rounded-[var(--nu-radius-lg)] transition-all duration-150 hover:shadow-[var(--nu-shadow-md)] px-3.5 pt-3.5 pb-3 flex flex-col justify-between gap-2.5 min-w-0 h-full border-[var(--nu-border)] shadow-[var(--nu-shadow-sm)] min-h-[122px]"
        >
          <div className="flex items-center justify-between shrink-0">
            <div className="rounded-[var(--nu-radius-md)] flex items-center justify-center shrink-0 w-7 h-7 bg-[var(--nu-warning-soft)] text-[var(--nu-warning)]">
              <Wallet size={14} />
            </div>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--nu-success)] bg-[var(--nu-success-soft)] px-1.5 py-0.5 rounded-full shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Live
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-[var(--nu-text-muted)] uppercase tracking-wide truncate">
              Total Project Cost
            </p>
            <p
              className="font-bold leading-tight truncate text-[21px] text-[var(--nu-text)] mt-1 animate-in fade-in duration-100"
              title={formatINR(totalProjectCost)}
            >
              {formatINR(totalProjectCost)}
            </p>
          </div>

          <div className="text-[11px] leading-snug shrink-0 text-[var(--nu-text-muted)] font-medium">
            MH {formatK(manhourBudgetAmount)} • NMH {formatK(nonManhourBudgetAmount)}
          </div>
        </div>

        {/* Budgeted Profit Card */}
        <div
          className="relative bg-[var(--nu-surface)] border rounded-[var(--nu-radius-lg)] transition-all duration-150 hover:shadow-[var(--nu-shadow-md)] px-3.5 pt-3.5 pb-3 flex flex-col justify-between gap-2.5 min-w-0 h-full border-[var(--nu-border)] shadow-[var(--nu-shadow-sm)] min-h-[122px]"
        >
          <div className="flex items-center justify-between shrink-0">
            <div className={`rounded-[var(--nu-radius-md)] flex items-center justify-center shrink-0 w-7 h-7 ${profitIconTintClass}`}>
              {profitIcon}
            </div>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--nu-success)] bg-[var(--nu-success-soft)] px-1.5 py-0.5 rounded-full shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Live
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-[var(--nu-text-muted)] uppercase tracking-wide truncate">
              Budgeted Profit
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <p
                className={`font-bold leading-tight truncate text-[21px] ${profitAmountTextClass}`}
                title={formattedProfitAmount}
              >
                {formattedProfitAmount}
              </p>
              <span className={`text-[12px] ${profitPercentTextClass}`}>
                {formattedProfitPercent}
              </span>
            </div>
          </div>

          <div className="text-[11px] leading-snug shrink-0">
            <span className="text-[var(--nu-text-muted)]">Calculated Automatically</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Man-Hour Expense Budget */}
        <Card padded={false} elevated>
          <CardHeader
            icon={<Clock size={15} />}
            title="Man-Hour Expense Budget"
            subtitle="Engineering man-hour cost allocation"
          />
          <CardBody className="space-y-4">
            <div>
              <label className={labelClass}>Budget Amount (INR)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)] text-[13px] font-semibold">
                  ₹
                </span>
                <Input
                  type="number"
                  value={manhourBudgetAmount || ""}
                  onChange={(e) =>
                    setProject((prev) => ({
                      ...prev,
                      manhourBudgetAmount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="Enter Man-Hour Budget Amount"
                  className="pl-7"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Budget Hours</label>
              <Input
                type="number"
                value={manhourBudgetHours || ""}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    manhourBudgetHours: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="Enter Budget Hours"
              />
            </div>

            <div>
              <label className={labelClass}>Remarks</label>
              <Textarea
                value={manhourBudgetRemarks}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    manhourBudgetRemarks: e.target.value,
                  }))
                }
                placeholder="Enter remarks (e.g. Engineering Estimate)"
                rows={3}
                className="resize-none"
              />
            </div>
          </CardBody>
        </Card>

        {/* Non Man-Hour Expense Budget */}
        <Card padded={false} elevated>
          <CardHeader
            icon={<Briefcase size={15} />}
            title="Non Man-Hour Expense Budget"
            subtitle="Travel, logistics and other cost allocation"
            iconTint="info"
          />
          <CardBody className="space-y-4">
            <div>
              <label className={labelClass}>Non Man-Hour Budget Amount (INR)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)] text-[13px] font-semibold">
                  ₹
                </span>
                <Input
                  type="number"
                  value={nonManhourBudgetAmount || ""}
                  onChange={(e) =>
                    setProject((prev) => ({
                      ...prev,
                      nonManhourBudgetAmount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="Enter Non Man-Hour Budget Amount"
                  className="pl-7"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Remarks</label>
              <Textarea
                value={nonManhourBudgetRemarks}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    nonManhourBudgetRemarks: e.target.value,
                  }))
                }
                placeholder="Enter remarks (e.g. Travel, Hotel, Accommodation)"
                rows={7}
                className="resize-none"
              />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
