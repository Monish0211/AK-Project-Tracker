import {
  CreditCard,
  ListChecks,
  PieChart,
  Wallet,
  CalendarClock,
} from "lucide-react";
import type { Project } from "../../../types/Project";
import { isMilestoneBilled } from "../../../services/milestoneBillingService";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { StatTile } from "../../../components/ui/StatTile";
import { Badge } from "../../../components/ui/Badge";
import type { Tone } from "../../../components/ui/Badge";
import { formatBusinessINR, formatFullINR } from "../../../utils/formatCurrency";

interface Props {
  project: Project;
}

type MilestoneStatus = "Upcoming" | "Due Today" | "Overdue";

const STATUS_TONE: Record<MilestoneStatus, Tone> = {
  Upcoming: "success",
  "Due Today": "warning",
  Overdue: "danger",
};

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getDaysDifference = (dueDate: string): number => {
  const today = startOfDay(new Date());
  const due = startOfDay(new Date(dueDate));

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.round((due.getTime() - today.getTime()) / millisecondsPerDay);
};

const getStatus = (daysLeft: number): MilestoneStatus => {
  if (daysLeft > 0) return "Upcoming";
  if (daysLeft === 0) return "Due Today";
  return "Overdue";
};

const getDaysLeftLabel = (daysLeft: number): string => {
  if (daysLeft > 0) return `${daysLeft} Days Left`;
  if (daysLeft === 0) return "Due Today";
  return `${Math.abs(daysLeft)} Days Overdue`;
};

const formatDate = (dateString: string): string => {
  if (!dateString) return "-";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const PaymentMilestoneView = ({ project }: Props) => {
  const milestones = project.paymentMilestones ?? [];

  const totalPayments = milestones.length;

  const totalPaymentPercentage = milestones.reduce(
    (sum, milestone) => sum + (milestone.paymentPercentage || 0),
    0
  );

  const remainingPercentage = 100 - totalPaymentPercentage;

  const totalAmount = (project.workOrderValueINR * totalPaymentPercentage) / 100;

  const isPercentageMismatch = Math.abs(totalPaymentPercentage - 100) > 0.01;

  return (
    <div className="space-y-3.5">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={<ListChecks size={15} />} label="Total Payments" value={String(totalPayments)} tint="accent" />
        <StatTile
          icon={<PieChart size={15} />}
          label="Total Payment %"
          value={`${totalPaymentPercentage.toFixed(2)}%`}
          tint={isPercentageMismatch ? "danger" : "success"}
        />
        <StatTile icon={<PieChart size={15} />} label="Remaining %" value={`${remainingPercentage.toFixed(2)}%`} tint="warning" />
        <StatTile icon={<Wallet size={15} />} label="Total Amount" value={formatBusinessINR(totalAmount)} tint="success" />
      </div>

      <Card padded={false} elevated>
        <CardHeader
          icon={<CreditCard size={15} />}
          title="Payment Milestones"
          subtitle="Project payment schedule"
          action={
            <Badge tone="accent">Payment Type: {project.paymentType}</Badge>
          }
        />
        <CardBody className="space-y-3.5">
          {milestones.length === 0 ? (
            <div className="text-center py-8 text-[var(--nu-text-muted)] text-[13px]">
              No payment milestones defined for this project.
            </div>
          ) : (
            <div className="relative space-y-4">
              {milestones.map((milestone, idx) => {
                const daysLeft = getDaysDifference(milestone.dueDate);
                const status = getStatus(daysLeft);
                const billed = isMilestoneBilled(project, milestone.id);
                const amount = (project.workOrderValueINR * (milestone.paymentPercentage || 0)) / 100;

                return (
                  <div key={milestone.id || idx} className="milestone-connector relative pl-8 pb-1">
                    <div className="absolute left-0 top-1 w-7 h-7 rounded-full bg-[var(--nu-surface-alt)] border-2 border-[var(--nu-accent)] flex items-center justify-center text-[11px] font-bold text-[var(--nu-accent)] z-10">
                      {idx + 1}
                    </div>

                    <div className="bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] p-4 transition-colors duration-150 hover:border-[var(--nu-border-strong)]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-[14px] font-bold text-[var(--nu-text)]">{milestone.milestoneName || `Milestone ${idx + 1}`}</h4>
                          {milestone.dueDate && (
                            <p className="flex items-center gap-1 text-[11.5px] text-[var(--nu-text-muted)] mt-0.5">
                              <CalendarClock size={13} className="shrink-0 text-[var(--nu-accent)]" />
                              {formatDate(milestone.dueDate)} · {getDaysLeftLabel(daysLeft)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                          <Badge tone={billed ? "success" : "neutral"}>{billed ? "Completed" : "Pending"}</Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 pt-3 border-t border-[var(--nu-border)]">
                        <div>
                          <p className="text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] font-medium">Payment %</p>
                          <p className="text-[13px] font-semibold text-[var(--nu-text)]">{(milestone.paymentPercentage || 0).toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] font-medium">Amount</p>
                          <p className="text-[13px] font-bold text-[var(--nu-success)]">{formatFullINR(amount)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default PaymentMilestoneView;
