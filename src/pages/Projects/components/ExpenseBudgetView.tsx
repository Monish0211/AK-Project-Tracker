import { useEffect, useState, type ReactNode } from "react";
import {
  Wallet,
  Receipt,
  PiggyBank,
  Calculator,
  TrendingUp,
  FileText,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  type LucideIcon,
} from "lucide-react";

import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";
import { StatTile } from "../../../components/ui/StatTile";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import {
  calculateBudgetExecution,
  getBudgetUtilizationTier,
  UTILIZATION_BADGE,
  type BudgetUtilizationTier,
  type BudgetExecution,
} from "../../../services/expenseBudgetAnalysisService";

interface Props {
  project: Project;
}

const formatCurrency = (value: number): string => formatBusinessINR(value || 0);

const formatHours = (value: number): string => `${value.toLocaleString("en-IN")} Hrs`;

const formatVarianceCurrency = (value: number): string => {
  const formatted = formatCurrency(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
};

const formatVarianceHours = (value: number): string => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toLocaleString("en-IN")} Hrs`;
};

/** Keeps the floating callout bubble's centerline inside the bar's bounds so it never clips off either edge. */
const clampCalloutPosition = (utilizationPercent: number): number => {
  const fillPosition = Math.min(Math.max(utilizationPercent, 0), 100);
  return Math.min(Math.max(fillPosition, 6), 94);
};

const varianceTone = (value: number): string => {
  if (value > 0) return "text-[var(--nu-danger)]";
  if (value < 0) return "text-[var(--nu-success)]";
  return "text-[var(--nu-text-muted)]";
};

/** Inverse of varianceTone — for "budget remaining" figures where positive = under budget (good) and negative = exceeded (bad). */
const remainingTone = (value: number): string => {
  if (value < 0) return "text-[var(--nu-danger)]";
  if (value > 0) return "text-[var(--nu-success)]";
  return "text-[var(--nu-text-muted)]";
};

const VarianceIcon = ({ value }: { value: number }) => {
  if (value > 0) return <ArrowUpRight size={13} className="shrink-0" />;
  if (value < 0) return <ArrowDownRight size={13} className="shrink-0" />;
  return <Minus size={13} className="shrink-0" />;
};

const BAR_FILL: Record<BudgetUtilizationTier, string> = {
  healthy: "bg-gradient-to-r from-emerald-500 to-emerald-400",
  approaching: "bg-gradient-to-r from-amber-500 to-amber-400",
  onBudget: "bg-gradient-to-r from-blue-600 to-blue-500",
  over: "bg-gradient-to-r from-red-600 to-red-500",
};

const CALLOUT_TEXT: Record<BudgetUtilizationTier, string> = {
  healthy: "text-[var(--nu-success)]",
  approaching: "text-[var(--nu-warning)]",
  onBudget: "text-[var(--nu-accent)]",
  over: "text-[var(--nu-danger)]",
};

const INSIGHT_STYLE: Record<BudgetUtilizationTier, { wrapper: string; icon: string; text: string; Icon: LucideIcon }> = {
  healthy: { wrapper: "bg-[var(--nu-success-soft)]", icon: "text-[var(--nu-success)]", text: "text-[var(--nu-success)]", Icon: CheckCircle2 },
  approaching: { wrapper: "bg-[var(--nu-warning-soft)]", icon: "text-[var(--nu-warning)]", text: "text-[var(--nu-warning)]", Icon: AlertTriangle },
  onBudget: { wrapper: "bg-[var(--nu-accent-soft)]", icon: "text-[var(--nu-accent)]", text: "text-[var(--nu-accent)]", Icon: Info },
  over: { wrapper: "bg-[var(--nu-danger-soft)]", icon: "text-[var(--nu-danger)]", text: "text-[var(--nu-danger)]", Icon: AlertOctagon },
};

const getInsightMessage = (tier: BudgetUtilizationTier, analysis: BudgetExecution): string => {
  const varianceAbs = formatCurrency(Math.abs(analysis.budgetVarianceRemaining));
  const utilization = analysis.budgetUtilizationPercent.toFixed(0);

  switch (tier) {
    case "over":
      return `Project has exceeded the approved budget by ${varianceAbs}. Immediate financial review is recommended.`;
    case "onBudget":
      return `Project cost exactly matches the approved budget of ${formatCurrency(analysis.approvedBudget)}. Continue monitoring closely.`;
    case "approaching":
      return `Project is approaching its approved budget — ${utilization}% utilized with ${varianceAbs} remaining. Review remaining scope before further spend.`;
    default:
      return `Project cost is well within the approved budget, with ${varianceAbs} remaining.`;
  }
};

const SummaryRow = ({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--nu-border)] last:border-b-0 last:pb-0">
    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">{label}</span>
    <span className={`text-[14px] font-bold tabular-nums whitespace-nowrap ${tone || "text-[var(--nu-text)]"}`}>{value}</span>
  </div>
);

const InsightIcon = ({ tier }: { tier: BudgetUtilizationTier }) => {
  const Icon = INSIGHT_STYLE[tier].Icon;
  return <Icon size={16} className={`mt-0.5 shrink-0 ${INSIGHT_STYLE[tier].icon}`} />;
};

const RemarksCard = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-3.5 py-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)] mb-1">{label}</p>
    <p
      className={`text-[12.5px] leading-snug whitespace-pre-wrap ${
        value ? "text-[var(--nu-text)]" : "italic text-[var(--nu-text-muted)]"
      }`}
    >
      {value || "No remarks available."}
    </p>
  </div>
);

export default function ExpenseBudgetView({ project }: Props) {
  // Timesheet imports don't dispatch "pmo:data-changed", so this tab polls
  // for fresh data the same way Team Assigned does — no manual refresh ever
  // required. Non Man-Hour Expense changes reach this view for free since
  // the parent ViewProject already re-fetches `project` on that event, and
  // calculateBudgetExecution re-reads everything fresh on every call.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 3000);
    return () => clearInterval(interval);
  }, []);

  const analysis = calculateBudgetExecution(project.id);
  if (!analysis) return null;

  const tier = getBudgetUtilizationTier(analysis.budgetUtilizationPercent);
  const badge = UTILIZATION_BADGE[tier];

  // "Total Project Budget" is the Work Order Value (unchanged, matches the
  // Edit page's own "Total Project Budget (WO)" tile). "Total Project Cost"
  // is analysis.approvedBudget — Planned Man-Hour + Planned Non Man-Hour
  // Budget — mirroring the Edit page's own "Total Project Cost" card exactly,
  // and the same figure the Execution Analysis table's "Total Budget" row and
  // Budget Utilization use as "Approved Budget", so all of them agree.
  const totalProjectBudget = analysis.plannedTotalBudget;
  const totalProjectCost = analysis.approvedBudget;

  const rows = [
    {
      label: "Budget Hours",
      planned: formatHours(analysis.plannedBudgetHours),
      actual: formatHours(analysis.actualBudgetHours),
      variance: analysis.budgetHoursVariance,
      varianceLabel: formatVarianceHours(analysis.budgetHoursVariance),
    },
    {
      label: "Man-Hour Budget",
      planned: formatCurrency(analysis.plannedManhourBudget),
      actual: formatCurrency(analysis.actualManhourBudget),
      variance: analysis.manhourBudgetVariance,
      varianceLabel: formatVarianceCurrency(analysis.manhourBudgetVariance),
    },
    {
      label: "Non Man-Hour Budget",
      planned: formatCurrency(analysis.plannedNonManhourBudget),
      actual: formatCurrency(analysis.actualNonManhourBudget),
      variance: analysis.nonManhourBudgetVariance,
      varianceLabel: formatVarianceCurrency(analysis.nonManhourBudgetVariance),
    },
    {
      label: "Total Budget",
      planned: formatCurrency(analysis.approvedBudget),
      actual: formatCurrency(analysis.actualTotalBudget),
      variance: analysis.totalBudgetVariance,
      varianceLabel: formatVarianceCurrency(analysis.totalBudgetVariance),
      emphasis: true,
    },
  ];

  return (
    <div className="space-y-3.5">
      {/* Section 1 — Planned Budget */}
      <InfoSection title="Planned Budget" subtitle="Approved budget baseline for this project." icon={<PiggyBank size={16} />}>
        <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <StatTile label="Total Man-Hour Budget" value={formatCurrency(analysis.plannedManhourBudget)} icon={<Wallet size={15} />} tint="accent" />
          <StatTile label="Total Non Man-Hour Budget" value={formatCurrency(analysis.plannedNonManhourBudget)} icon={<Receipt size={15} />} tint="info" />
          <StatTile label="Total Project Budget" value={formatCurrency(totalProjectBudget)} icon={<PiggyBank size={15} />} tint="success" />
          <StatTile label="Total Project Cost" value={formatCurrency(totalProjectCost)} icon={<Calculator size={15} />} tint="warning" />
        </div>

        <InfoField label="Man-Hour Budget Hours" value={formatHours(analysis.plannedBudgetHours)} />
      </InfoSection>

      {/* Section 2 — Execution Analysis (left, dominant) + Budget Remarks (right, compact) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(260px,1fr)] min-[1920px]:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)] gap-3.5 items-start">
        <Card padded={false}>
          <CardHeader
            icon={<TrendingUp size={16} />}
            title="Execution Analysis"
            subtitle="Actual project execution from imported Timesheets and Other Project Expenses."
          />
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="nu-table-th px-5 py-3 text-left rounded-l-[var(--nu-radius-sm)]">Category</th>
                    <th className="nu-table-th px-5 py-3 text-right">Planned</th>
                    <th className="nu-table-th px-5 py-3 text-right">Actual</th>
                    <th className="nu-table-th px-5 py-3 text-right rounded-r-[var(--nu-radius-sm)]">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.label}
                      className={`nu-table-row ${row.emphasis ? "border-t-2 border-t-[var(--nu-border-strong)]" : ""}`}
                    >
                      <td
                        className={`px-5 py-4 tracking-tight ${
                          row.emphasis ? "text-[14px] font-extrabold text-[var(--nu-text)]" : "text-[13.5px] font-semibold text-[var(--nu-text)]"
                        }`}
                      >
                        {row.label}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums text-[13.5px] text-[var(--nu-text-secondary)] whitespace-nowrap">
                        {row.planned}
                      </td>
                      <td
                        className={`px-5 py-4 text-right tabular-nums whitespace-nowrap ${
                          row.emphasis ? "text-[14px] font-extrabold text-[var(--nu-text)]" : "text-[13.5px] font-semibold text-[var(--nu-text)]"
                        }`}
                      >
                        {row.actual}
                      </td>
                      <td className={`px-5 py-4 text-right tabular-nums font-bold whitespace-nowrap ${varianceTone(row.variance)}`}>
                        <span className="inline-flex items-center gap-1 justify-end w-full">
                          <VarianceIcon value={row.variance} />
                          {row.varianceLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card padded={false}>
          <CardHeader icon={<FileText size={16} />} title="Budget Remarks" subtitle="Supporting notes for the planned budget." />
          <CardBody className="space-y-2.5">
            <RemarksCard label="Man-Hour Budget Remarks" value={project.manhourBudgetRemarks || ""} />
            <RemarksCard label="Non Man-Hour Budget Remarks" value={project.nonManhourBudgetRemarks || ""} />
          </CardBody>
        </Card>
      </div>

      {/* Section 3 — Budget Utilization / Financial Health Summary (full width, the page's highlight) */}
      <Card padded={false}>
        <CardHeader icon={<Gauge size={16} />} title="Budget Utilization" subtitle="Approved Budget vs. Actual Project Cost — the project's financial health at a glance." />
        <CardBody className="py-5 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(260px,2fr)] gap-6 items-stretch">
            {/* Left — utilization bar with the percentage anchored directly to it */}
            <div className="pt-8 flex flex-col justify-center">
              <div className="relative w-full">
                <div
                  className="absolute -top-8 flex flex-col items-center transition-all duration-700 ease-out"
                  style={{ left: `${clampCalloutPosition(analysis.budgetUtilizationPercent)}%`, transform: "translateX(-50%)" }}
                >
                  <span
                    className={`text-[15px] font-extrabold tabular-nums whitespace-nowrap bg-[var(--nu-surface)] border border-[var(--nu-border-strong)] rounded-full px-3 py-0.5 shadow-[var(--nu-shadow-sm)] ${CALLOUT_TEXT[tier]}`}
                  >
                    {analysis.budgetUtilizationPercent.toFixed(0)}%
                  </span>
                  <span className="w-2 h-2 -mt-[5px] rotate-45 bg-[var(--nu-surface)] border-r border-b border-[var(--nu-border-strong)]" />
                </div>

                <div className="relative w-full h-9 sm:h-10 rounded-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] overflow-hidden shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${BAR_FILL[tier]}`}
                    style={{ width: `${Math.min(Math.max(analysis.budgetUtilizationPercent, 0), 100)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-1.5 px-0.5">
                {["0%", "25%", "50%", "75%", "100%", "Above 100%"].map((marker) => (
                  <span
                    key={marker}
                    className={`text-[11px] font-semibold ${
                      marker === "Above 100%" && tier === "over" ? "text-[var(--nu-danger)]" : "text-[var(--nu-text-muted)]"
                    }`}
                  >
                    {marker}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — Executive Summary Card */}
            <div className="bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] mb-1.5">Executive Summary</p>
              <SummaryRow label="Approved Budget" value={formatCurrency(analysis.approvedBudget)} />
              <SummaryRow label="Actual Project Cost" value={formatCurrency(analysis.actualTotalBudget)} />
              <SummaryRow
                label="Budget Remaining / Exceeded"
                value={formatVarianceCurrency(analysis.budgetVarianceRemaining)}
                tone={remainingTone(analysis.budgetVarianceRemaining)}
              />
              <SummaryRow label="Budget Utilization" value={`${analysis.budgetUtilizationPercent.toFixed(0)}%`} tone={CALLOUT_TEXT[tier]} />
              <SummaryRow label="Financial Status" value={<Badge tone={badge.tone} dot className="text-[11.5px]">{badge.label}</Badge>} />
            </div>
          </div>

          {/* Insight banner — plain-language read on the numbers above */}
          <div className={`mt-4 rounded-[var(--nu-radius-md)] px-4 py-3 flex items-start gap-2.5 ${INSIGHT_STYLE[tier].wrapper}`}>
            <InsightIcon tier={tier} />
            <p className={`text-[12.5px] leading-snug font-medium ${INSIGHT_STYLE[tier].text}`}>{getInsightMessage(tier, analysis)}</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
