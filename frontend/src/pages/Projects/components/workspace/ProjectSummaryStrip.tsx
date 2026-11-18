import {
  Briefcase,
  CalendarCheck,
  FileText,
  Gauge,
  Landmark,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { StatTile } from "../../../../components/ui/StatTile";

interface Props {
  /** The project's regional currency (Phase 3); INR when not given. */
  currency?: string;
  workOrderValue: number;
  invoiceRaised: number;
  paymentReceived: number;
  outstanding: number;
  budget: number;
  expenses: number;
  profit: number;
  completionPercent: number;
  milestoneCount: number;
  teamCount: number;
}

import { moneyFormatter } from "../../../../utils/currencyDisplay";
import { CurrencyIcon } from "../../../../components/ui/CurrencyIcon";

const ProjectSummaryStrip = ({
  workOrderValue,
  invoiceRaised,
  paymentReceived,
  outstanding,
  budget,
  expenses,
  profit,
  completionPercent,
  milestoneCount,
  teamCount,
  currency = "INR",
}: Props) => {
  const money = moneyFormatter(currency);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatTile emphasis="secondary" label="Work Order Value" value={money.compact(workOrderValue)} icon={<CurrencyIcon currency={currency} size={14} />} tint="accent" />
      <StatTile emphasis="secondary" label="Invoice Raised" value={money.compact(invoiceRaised)} icon={<FileText size={14} />} tint="info" />
      <StatTile emphasis="secondary" label="Payment Received" value={money.compact(paymentReceived)} icon={<Landmark size={14} />} tint="success" />
      <StatTile emphasis="secondary" label="Outstanding" value={money.compact(outstanding)} icon={<Wallet size={14} />} tint="danger" />
      <StatTile emphasis="secondary" label="Budget" value={money.compact(budget)} icon={<Briefcase size={14} />} tint="info" />
      <StatTile emphasis="secondary" label="Expenses" value={money.compact(expenses)} icon={<Receipt size={14} />} tint="warning" />
      <StatTile emphasis="secondary" label="Profit" value={money.compact(profit)} icon={<TrendingUp size={14} />} tint={profit >= 0 ? "success" : "danger"} />
      <StatTile emphasis="secondary" label="Completion %" value={`${completionPercent.toFixed(1)}%`} icon={<Gauge size={14} />} tint="accent" />
      <StatTile emphasis="secondary" label="Milestones" value={milestoneCount.toString()} icon={<CalendarCheck size={14} />} tint="info" />
      <StatTile emphasis="secondary" label="Team Members" value={teamCount.toString()} icon={<Users size={14} />} tint="accent" />
    </div>
  );
};

export default ProjectSummaryStrip;
