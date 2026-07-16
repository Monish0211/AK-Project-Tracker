import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  ListChecks,
  PieChart,
  Wallet,
} from "lucide-react";
import type { Project } from "../../../types/Project";
import { isMilestoneBilled } from "../../../services/milestoneBillingService";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { StatTile } from "../../../components/ui/StatTile";
import { Badge } from "../../../components/ui/Badge";
import type { Tone } from "../../../components/ui/Badge";

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

const formatCurrency = (value: number): string =>
  `₹ ${(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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
        <StatTile icon={<Wallet size={15} />} label="Total Amount" value={formatCurrency(totalAmount)} tint="success" />
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
          {isPercentageMismatch && (
            <div className="flex items-center gap-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-danger)]/30 bg-[var(--nu-danger-soft)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--nu-danger)]">
              <AlertTriangle size={14} strokeWidth={2.25} />
              Total payment percentage does not equal 100%.
            </div>
          )}

          {milestones.length === 0 ? (
            <p className="text-center py-8 text-[var(--nu-text-muted)] text-[12.5px]">
              No payment milestones have been added for this project.
            </p>
          ) : (
            <div className="space-y-0">
              {milestones.map((milestone, index) => {
                const daysLeft = getDaysDifference(milestone.dueDate);
                const status = getStatus(daysLeft);
                const billed = isMilestoneBilled(project, milestone.id);
                const amount = (project.workOrderValueINR * (milestone.paymentPercentage || 0)) / 100;

                return (
                  <div key={milestone.id} className="milestone-connector relative flex gap-3.5 pb-5">
                    <div className="w-8 h-8 rounded-full bg-[var(--nu-accent)] text-white flex items-center justify-center text-[12px] font-bold shrink-0 z-10">
                      {index + 1}
                    </div>
                    <div className="flex-1 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-[var(--nu-text)] truncate">
                            {milestone.milestoneName?.trim() || `Milestone ${index + 1}`}
                          </p>
                          <p className="flex items-center gap-1.5 text-[12px] text-[var(--nu-text-muted)] mt-1">
                            <CalendarClock size={13} className="shrink-0 text-[var(--nu-accent)]" />
                            {formatDate(milestone.dueDate)} · {getDaysLeftLabel(daysLeft)}
                          </p>
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
                          <p className="text-[13px] font-bold text-[var(--nu-success)]">{formatCurrency(amount)}</p>
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
