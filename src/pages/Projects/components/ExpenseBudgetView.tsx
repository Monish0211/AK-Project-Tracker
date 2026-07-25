import { useEffect, useState, type ReactNode } from "react";
import {
  Wallet,
  Receipt,
  PiggyBank,
  Calculator,
  TrendingUp,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  IndianRupee,
  Scale,
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

/** Variance % as a rounded integer string, e.g. "-100%" or "+28%" */
const formatVariancePercent = (planned: number, variance: number): string => {
  if (planned === 0) return "—";
  const pct = Math.round((variance / Math.abs(planned)) * 100);
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
};

const clampCalloutPosition = (utilizationPercent: number): number => {
  const fillPosition = Math.min(Math.max(utilizationPercent, 0), 100);
  return Math.min(Math.max(fillPosition, 6), 94);
};

const varianceTone = (value: number): string => {
  if (value > 0) return "text-[var(--nu-danger)]";
  if (value < 0) return "text-[var(--nu-success)]";
  return "text-[var(--nu-text-muted)]";
};

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

/** Badge chip for the VARIANCE % column — green for negative (under budget), red for positive (over), grey for zero */
const VariancePctBadge = ({ value, varianceRaw }: { value: string; varianceRaw: number }) => {
  if (value === "—") return <span className="text-[var(--nu-text-muted)] text-[12px]">—</span>;
  const isGood = varianceRaw < 0;
  const isOver = varianceRaw > 0;
  const base = "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11.5px] font-bold tabular-nums";
  if (isGood)
    return (
      <span className={`${base} bg-[var(--nu-success-soft)] text-[var(--nu-success)]`}>
        {value}
      </span>
    );
  if (isOver)
    return (
      <span className={`${base} bg-[var(--nu-danger-soft)] text-[var(--nu-danger)]`}>
        {value}
      </span>
    );
  return (
    <span className={`${base} bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)]`}>
      {value}
    </span>
  );
};

const GAUGE_GRADIENT =
  "linear-gradient(to right, #22c55e 0%, #84cc16 30%, #eab308 55%, #f97316 78%, #dc2626 100%)";

const CALLOUT_TEXT: Record<BudgetUtilizationTier, string> = {
  healthy: "text-[var(--nu-success)]",
  approaching: "text-[var(--nu-warning)]",
  onBudget: "text-[var(--nu-accent)]",
  over: "text-[var(--nu-danger)]",
};

const TIER_ACCENT: Record<BudgetUtilizationTier, string> = {
  healthy: "var(--nu-success)",
  approaching: "var(--nu-warning)",
  onBudget: "var(--nu-accent)",
  over: "var(--nu-danger)",
};

const INSIGHT_STYLE: Record<BudgetUtilizationTier, { wrapper: string; icon: string; text: string; Icon: LucideIcon }> = {
  healthy:    { wrapper: "bg-[var(--nu-success-soft)]",  icon: "text-[var(--nu-success)]",  text: "text-[var(--nu-success)]",  Icon: CheckCircle2  },
  approaching:{ wrapper: "bg-[var(--nu-warning-soft)]",  icon: "text-[var(--nu-warning)]",  text: "text-[var(--nu-warning)]",  Icon: AlertTriangle },
  onBudget:   { wrapper: "bg-[var(--nu-accent-soft)]",   icon: "text-[var(--nu-accent)]",   text: "text-[var(--nu-accent)]",   Icon: Info          },
  over:       { wrapper: "bg-[var(--nu-danger-soft)]",   icon: "text-[var(--nu-danger)]",   text: "text-[var(--nu-danger)]",   Icon: AlertOctagon  },
};

const UTILIZATION_LEGEND: { label: string; range: string; color: string }[] = [
  { label: "Healthy",           range: "0–80%",      color: "var(--nu-success)"  },
  { label: "Approaching Budget",range: "81–99%",     color: "var(--nu-warning)"  },
  { label: "On Budget",         range: "100%",       color: "var(--nu-accent)"   },
  { label: "Over Budget",       range: "Above 100%", color: "var(--nu-danger)"   },
];

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

const SummaryRow = ({
  label, value, tone, icon,
}: {
  label: string; value: ReactNode; tone?: string; icon?: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--nu-border)] last:border-b-0 last:pb-0">
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
      {icon}
      {label}
    </span>
    <span className={`text-[14px] font-bold tabular-nums whitespace-nowrap ${tone || "text-[var(--nu-text)]"}`}>
      {value}
    </span>
  </div>
);

const InsightIcon = ({ tier }: { tier: BudgetUtilizationTier }) => {
  const Icon = INSIGHT_STYLE[tier].Icon;
  return <Icon size={16} className={`mt-0.5 shrink-0 ${INSIGHT_STYLE[tier].icon}`} />;
};

export default function ExpenseBudgetView({ project }: Props) {
  const [, forceTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 3000);
    return () => clearInterval(interval);
  }, []);

  // Trigger CSS entrance animations after first paint
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const analysis = calculateBudgetExecution(project.id);
  if (!analysis) return null;

  const tier = getBudgetUtilizationTier(analysis.budgetUtilizationPercent);
  const badge = UTILIZATION_BADGE[tier];

  const totalProjectBudget = analysis.plannedTotalBudget;
  const totalProjectCost   = analysis.approvedBudget;

  /* ── Execution Analysis rows ─────────────────────────────────────
     Each row now carries:
       • label   — bold row title
       • subtitle — muted helper text (matches screenshot 1)
       • planned / actual / variance / varianceLabel — existing data
       • plannedRaw  — raw numeric planned value (needed for % calc)
       • varianceRaw — raw numeric variance value
  ─────────────────────────────────────────────────────────────── */
  const rows = [
    {
      label: "Budget Hours",
      subtitle: "Total approved hours",
      plannedRaw: analysis.plannedBudgetHours,
      varianceRaw: analysis.budgetHoursVariance,
      planned: formatHours(analysis.plannedBudgetHours),
      actual:  formatHours(analysis.actualBudgetHours),
      variance: analysis.budgetHoursVariance,
      varianceLabel: formatVarianceHours(analysis.budgetHoursVariance),
    },
    {
      label: "Man-Hour Budget",
      subtitle: "Approved man-hour budget",
      plannedRaw: analysis.plannedManhourBudget,
      varianceRaw: analysis.manhourBudgetVariance,
      planned: formatCurrency(analysis.plannedManhourBudget),
      actual:  formatCurrency(analysis.actualManhourBudget),
      variance: analysis.manhourBudgetVariance,
      varianceLabel: formatVarianceCurrency(analysis.manhourBudgetVariance),
    },
    {
      label: "Non Man-Hour Budget",
      subtitle: "Approved non man-hour budget",
      plannedRaw: analysis.plannedNonManhourBudget,
      varianceRaw: analysis.nonManhourBudgetVariance,
      planned: formatCurrency(analysis.plannedNonManhourBudget),
      actual:  formatCurrency(analysis.actualNonManhourBudget),
      variance: analysis.nonManhourBudgetVariance,
      varianceLabel: formatVarianceCurrency(analysis.nonManhourBudgetVariance),
    },
    {
      label: "Total Budget",
      subtitle: "Total approved project budget",
      plannedRaw: analysis.approvedBudget,
      varianceRaw: analysis.totalBudgetVariance,
      planned: formatCurrency(analysis.approvedBudget),
      actual:  formatCurrency(analysis.actualTotalBudget),
      variance: analysis.totalBudgetVariance,
      varianceLabel: formatVarianceCurrency(analysis.totalBudgetVariance),
      emphasis: true,
    },
  ];

  return (
    <div className="space-y-3.5">

      {/* ── Micro-animation CSS ───────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .eb-card-enter { opacity:0; transform:translateY(14px); transition:opacity 420ms ease,transform 420ms ease; }
        .eb-card-enter.vis { opacity:1; transform:translateY(0); }

        .eb-right-enter { opacity:0; transform:translateX(18px); transition:opacity 450ms ease 120ms,transform 450ms ease 120ms; }
        .eb-right-enter.vis { opacity:1; transform:translateX(0); }

        .eb-row { opacity:0; transform:translateY(8px); transition:opacity 360ms ease,transform 360ms ease; }
        .eb-row.vis { opacity:1; transform:translateY(0); }
        .eb-row-1 { transition-delay:80ms; }
        .eb-row-2 { transition-delay:150ms; }
        .eb-row-3 { transition-delay:220ms; }
        .eb-row-4 { transition-delay:290ms; }

        .eb-badge { transform:scale(0.75); opacity:0; transition:transform 320ms cubic-bezier(.22,.68,0,1.3),opacity 280ms ease; }
        .eb-badge.vis { transform:scale(1); opacity:1; }
        .eb-badge-1 { transition-delay:120ms; }
        .eb-badge-2 { transition-delay:190ms; }
        .eb-badge-3 { transition-delay:260ms; }
        .eb-badge-4 { transition-delay:330ms; }

        .eb-gauge { transform-origin:left center; transform:scaleX(0); transition:transform 900ms cubic-bezier(.22,.68,0,1.1) 200ms; }
        .eb-gauge.vis { transform:scaleX(1); }

        .eb-util-enter { opacity:0; transform:translateY(12px); transition:opacity 400ms ease 80ms,transform 400ms ease 80ms; }
        .eb-util-enter.vis { opacity:1; transform:translateY(0); }

        .eb-sumrow { opacity:0; transform:translateX(10px); transition:opacity 340ms ease,transform 340ms ease; }
        .eb-sumrow.vis { opacity:1; transform:translateX(0); }
        .eb-sumrow-1 { transition-delay:200ms; }
        .eb-sumrow-2 { transition-delay:270ms; }
        .eb-sumrow-3 { transition-delay:340ms; }
        .eb-sumrow-4 { transition-delay:410ms; }
        .eb-sumrow-5 { transition-delay:480ms; }

        .eb-insight { opacity:0; transform:translateY(10px); transition:opacity 380ms ease 360ms,transform 380ms ease 360ms; }
        .eb-insight.vis { opacity:1; transform:translateY(0); }

        .eb-kpi { opacity:0; transform:translateY(10px); transition:opacity 360ms ease,transform 360ms ease; }
        .eb-kpi.vis { opacity:1; transform:translateY(0); }
        .eb-kpi-1 { transition-delay:40ms; }
        .eb-kpi-2 { transition-delay:110ms; }
        .eb-kpi-3 { transition-delay:180ms; }
        .eb-kpi-4 { transition-delay:250ms; }

        .nu-table-row:hover td { background:var(--nu-surface-alt); transition:background 180ms ease; }
      `}} />

      {/* ── Section 1 – Planned Budget KPIs ───────────────────────── */}
      <InfoSection
        title="Planned Budget"
        subtitle="Approved budget baseline for this project."
        icon={<PiggyBank size={16} />}
      >
        <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className={`eb-kpi eb-kpi-1${mounted ? " vis" : ""}`}><StatTile label="Total Man-Hour Budget"     value={formatCurrency(analysis.plannedManhourBudget)}    icon={<Wallet    size={15} />} tint="accent"  /></div>
          <div className={`eb-kpi eb-kpi-2${mounted ? " vis" : ""}`}><StatTile label="Total Non Man-Hour Budget" value={formatCurrency(analysis.plannedNonManhourBudget)} icon={<Receipt   size={15} />} tint="info"    /></div>
          <div className={`eb-kpi eb-kpi-3${mounted ? " vis" : ""}`}><StatTile label="Total Project Budget"      value={formatCurrency(totalProjectBudget)}               icon={<PiggyBank size={15} />} tint="success" /></div>
          <div className={`eb-kpi eb-kpi-4${mounted ? " vis" : ""}`}><StatTile label="Total Project Cost"        value={formatCurrency(totalProjectCost)}                 icon={<Calculator size={15} />} tint="warning" /></div>
        </div>
        <InfoField label="Man-Hour Budget Hours" value={formatHours(analysis.plannedBudgetHours)} />
      </InfoSection>


      {/* ── Section 2 – Execution Analysis (left) + Budget Remarks (right) ── */}
      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_300px] gap-3.5 items-stretch">

        {/* LEFT — Execution Analysis table */}
        <Card padded={false} className={`eb-card-enter${mounted ? " vis" : ""}`}>
          <CardHeader
            icon={<TrendingUp size={16} />}
            title="Execution Analysis"
            subtitle="Actual project execution from imported Timesheets and Other Project Expenses."
          />
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[560px]">
                <thead>
                  <tr>
                    <th className="nu-table-th px-5 py-3 text-left rounded-l-[var(--nu-radius-sm)] w-[32%]">
                      Category
                    </th>
                    <th className="nu-table-th px-5 py-3 text-right w-[17%]">Planned</th>
                    <th className="nu-table-th px-5 py-3 text-right w-[17%]">Actual</th>
                    <th className="nu-table-th px-5 py-3 text-right w-[20%]">Variance</th>
                    <th className="nu-table-th px-5 py-3 text-right rounded-r-[var(--nu-radius-sm)] w-[14%]">
                      Variance %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const pctLabel = formatVariancePercent(row.plannedRaw, row.varianceRaw);
                    const ri = i + 1;
                    return (
                      <tr
                        key={row.label}
                        className={`nu-table-row eb-row eb-row-${ri}${mounted ? " vis" : ""} ${row.emphasis ? "border-t-2 border-t-[var(--nu-border-strong)]" : ""}`}
                        style={row.emphasis ? { borderLeft: `3px solid ${TIER_ACCENT[tier]}` } : undefined}
                      >
                        <td className="px-5 py-3.5">
                          <p className={`leading-tight tracking-tight ${
                            row.emphasis
                              ? "text-[14px] font-extrabold text-[var(--nu-text)]"
                              : "text-[13.5px] font-semibold text-[var(--nu-text)]"
                          }`}>
                            {row.label}
                          </p>
                          <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-0.5">
                            {row.subtitle}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-[13.5px] text-[var(--nu-text-secondary)] whitespace-nowrap">
                          {row.planned}
                        </td>
                        <td className={`px-5 py-3.5 text-right tabular-nums whitespace-nowrap ${
                          row.emphasis
                            ? "text-[14px] font-extrabold text-[var(--nu-text)]"
                            : "text-[13.5px] font-semibold text-[var(--nu-text)]"
                        }`}>
                          {row.actual}
                        </td>
                        <td className={`px-5 py-3.5 text-right tabular-nums font-bold whitespace-nowrap ${varianceTone(row.variance)}`}>
                          <span className="inline-flex items-center gap-1 justify-end w-full">
                            <VarianceIcon value={row.variance} />
                            {row.varianceLabel}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className={`eb-badge eb-badge-${ri}${mounted ? " vis" : ""}`}>
                            <VariancePctBadge value={pctLabel} varianceRaw={row.varianceRaw} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* RIGHT — Budget Remarks only (no baseline data, no contract type) */}
        <Card padded={false} className={`flex flex-col h-full eb-right-enter${mounted ? " vis" : ""}`}>
          <CardHeader
            icon={<Wallet size={16} />}
            title="Budget Remarks"
            subtitle="Baseline remarks for reference."
          />
          <CardBody className="flex flex-col gap-3.5 flex-1">
            {/* Man-Hour Remarks — grows to fill space */}
            <div className="flex flex-col flex-1 space-y-1.5 min-h-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] shrink-0">
                Man-Hour Budget Remarks
              </p>
              <div className="flex-1 min-h-[72px] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-3 py-2.5">
                <p className={`text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                  project.manhourBudgetRemarks ? "text-[var(--nu-text)]" : "italic text-[var(--nu-text-muted)]"
                }`}>
                  {project.manhourBudgetRemarks || "No remarks available."}
                </p>
              </div>
            </div>
            {/* Non Man-Hour Remarks — grows to fill space */}
            <div className="flex flex-col flex-1 space-y-1.5 min-h-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] shrink-0">
                Non Man-Hour Budget Remarks
              </p>
              <div className="flex-1 min-h-[72px] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-3 py-2.5">
                <p className={`text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                  project.nonManhourBudgetRemarks ? "text-[var(--nu-text)]" : "italic text-[var(--nu-text-muted)]"
                }`}>
                  {project.nonManhourBudgetRemarks || "No remarks available."}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

      </div>


      {/* ── Section 4 – Budget Utilization Trend + Executive Summary ────── */}
      <Card padded={false} className={`eb-util-enter${mounted ? " vis" : ""}`}>
        <CardHeader
          icon={<Gauge size={16} />}
          title="Budget Utilization Trend"
          subtitle="Live utilization of actual cost against approved budget."
        />
        <CardBody className="py-5 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">

            {/* Left — gauge bar */}
            <div className="bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-4 py-4">
              <div className="relative w-full pt-8">
                {/* Floating % callout */}
                <div
                  className="absolute top-0 flex flex-col items-center transition-all duration-700 ease-out"
                  style={{
                    left: `${clampCalloutPosition(analysis.budgetUtilizationPercent)}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <span
                    className={`text-[15px] font-extrabold tabular-nums whitespace-nowrap bg-[var(--nu-surface)] border border-[var(--nu-border-strong)] rounded-full px-3 py-0.5 shadow-[var(--nu-shadow-sm)] ${CALLOUT_TEXT[tier]}`}
                  >
                    {analysis.budgetUtilizationPercent.toFixed(0)}%
                  </span>
                  <div
                    className="w-0 h-0 mt-0.5"
                    style={{
                      borderLeft:  "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderTop:   "7px solid var(--nu-text)",
                    }}
                  />
                </div>

                {/* Colour bar */}
                <div
                  className={`relative w-full h-3 rounded-full border border-[var(--nu-border)] shadow-inner eb-gauge${mounted ? " vis" : ""}`}
                  style={{ background: GAUGE_GRADIENT }}
                />
              </div>

              {/* Axis labels */}
              <div className="flex items-center justify-between mt-2 px-0.5">
                {["0%", "25%", "50%", "75%", "100%", "Above 100%"].map((marker) => (
                  <span
                    key={marker}
                    className={`text-[11px] font-semibold ${
                      marker === "Above 100%" && tier === "over"
                        ? "text-[var(--nu-danger)]"
                        : "text-[var(--nu-text-muted)]"
                    }`}
                  >
                    {marker}
                  </span>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-[var(--nu-border)]">
                {UTILIZATION_LEGEND.map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[10.5px] font-semibold text-[var(--nu-text-secondary)]">{item.label}</span>
                    <span className="text-[10px] text-[var(--nu-text-muted)]">{item.range}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Executive Summary */}
            <div
              className="bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-4 py-3"
              style={{ borderLeft: `3px solid ${TIER_ACCENT[tier]}` }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] mb-1.5">
                Executive Summary
              </p>
              <div className={`eb-sumrow eb-sumrow-1${mounted ? " vis" : ""}`}>
                <SummaryRow
                  label="Approved Budget"
                  value={formatCurrency(analysis.approvedBudget)}
                  icon={<IndianRupee size={12} className="text-[var(--nu-text-muted)]" />}
                />
              </div>
              <div className={`eb-sumrow eb-sumrow-2${mounted ? " vis" : ""}`}>
                <SummaryRow
                  label="Actual Project Cost"
                  value={formatCurrency(analysis.actualTotalBudget)}
                  icon={<Calculator size={12} className="text-[var(--nu-text-muted)]" />}
                />
              </div>
              <div className={`eb-sumrow eb-sumrow-3${mounted ? " vis" : ""}`}>
                <SummaryRow
                  label="Budget Variance"
                  value={formatVarianceCurrency(analysis.budgetVarianceRemaining)}
                  tone={remainingTone(analysis.budgetVarianceRemaining)}
                  icon={<Scale size={12} className="text-[var(--nu-text-muted)]" />}
                />
              </div>
              <div className={`eb-sumrow eb-sumrow-4${mounted ? " vis" : ""}`}>
                <SummaryRow
                  label="Budget Utilization"
                  value={`${analysis.budgetUtilizationPercent.toFixed(0)}%`}
                  tone={CALLOUT_TEXT[tier]}
                  icon={<Gauge size={12} className="text-[var(--nu-text-muted)]" />}
                />
              </div>
              <div className={`eb-sumrow eb-sumrow-5${mounted ? " vis" : ""}`}>
                <SummaryRow
                  label="Financial Status"
                  value={<Badge tone={badge.tone} dot className="text-[11.5px]">{badge.label}</Badge>}
                />
              </div>
            </div>
          </div>

          {/* Insight banner */}
          <div className={`mt-4 rounded-[var(--nu-radius-md)] px-4 py-3 flex items-start gap-2.5 ${INSIGHT_STYLE[tier].wrapper} eb-insight${mounted ? " vis" : ""}`}>
            <InsightIcon tier={tier} />
            <p className={`text-[12.5px] leading-snug font-medium ${INSIGHT_STYLE[tier].text}`}>
              {getInsightMessage(tier, analysis)}
            </p>
          </div>
        </CardBody>
      </Card>

    </div>
  );
}
