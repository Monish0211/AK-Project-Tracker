import {
  Briefcase,
  CalendarCheck,
  FileText,
  Gauge,
  IndianRupee,
  Landmark,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { StatTile } from "../../../../components/ui/StatTile";

interface Props {
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

const formatINR = (value: number): string => `₹${(value || 0).toLocaleString("en-IN")}`;

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
}: Props) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatTile emphasis="secondary" label="Work Order Value" value={formatINR(workOrderValue)} icon={<IndianRupee size={14} />} tint="accent" />
      <StatTile emphasis="secondary" label="Invoice Raised" value={formatINR(invoiceRaised)} icon={<FileText size={14} />} tint="info" />
      <StatTile emphasis="secondary" label="Payment Received" value={formatINR(paymentReceived)} icon={<Landmark size={14} />} tint="success" />
      <StatTile emphasis="secondary" label="Outstanding" value={formatINR(outstanding)} icon={<Wallet size={14} />} tint="danger" />
      <StatTile emphasis="secondary" label="Budget" value={formatINR(budget)} icon={<Briefcase size={14} />} tint="info" />
      <StatTile emphasis="secondary" label="Expenses" value={formatINR(expenses)} icon={<Receipt size={14} />} tint="warning" />
      <StatTile emphasis="secondary" label="Profit" value={formatINR(profit)} icon={<TrendingUp size={14} />} tint={profit >= 0 ? "success" : "danger"} />
      <StatTile emphasis="secondary" label="Completion %" value={`${completionPercent.toFixed(1)}%`} icon={<Gauge size={14} />} tint="accent" />
      <StatTile emphasis="secondary" label="Milestones" value={milestoneCount.toString()} icon={<CalendarCheck size={14} />} tint="info" />
      <StatTile emphasis="secondary" label="Team Members" value={teamCount.toString()} icon={<Users size={14} />} tint="accent" />
    </div>
  );
};

export default ProjectSummaryStrip;
