import {
  Clock,
  FileText,
  IndianRupee,
  TrendingUp,
  Wallet,
} from "lucide-react";

import type { InvoiceItem } from "../../../../types/InvoiceItem";

import {
  getBalanceAmount,
  getInvoiceCompletionPercentage,
  getInvoiceCount,
  getOutstandingCollection,
  getTotalInvoiceRaised,
} from "../../../../services/invoiceProgressService";
import { formatIndianCurrency } from "../../../../utils/quantityCalculations";

interface Props {
  workOrderValueINR: number;
  invoiceItems: InvoiceItem[];
  collectionReceived: number;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "blue" | "purple" | "orange" | "green" | "slate" | "red";
}

const ACCENT_STYLES: Record<
  KpiCardProps["accent"],
  { iconBg: string; iconText: string; valueText: string }
> = {
  blue: { iconBg: "bg-blue-50", iconText: "text-blue-600", valueText: "text-slate-800" },
  purple: { iconBg: "bg-purple-50", iconText: "text-purple-600", valueText: "text-slate-800" },
  orange: { iconBg: "bg-orange-50", iconText: "text-orange-600", valueText: "text-slate-800" },
  green: { iconBg: "bg-green-50", iconText: "text-green-600", valueText: "text-green-600" },
  slate: { iconBg: "bg-slate-50", iconText: "text-slate-600", valueText: "text-slate-800" },
  red: { iconBg: "bg-red-50", iconText: "text-red-600", valueText: "text-red-600" },
};

const KpiCard = ({ icon, label, value, accent }: KpiCardProps) => {
  const styles = ACCENT_STYLES[accent];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.iconBg} ${styles.iconText}`}>
        {icon}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${styles.valueText}`}>{value}</p>
    </div>
  );
};

const InvoiceSummaryCards = ({
  workOrderValueINR,
  invoiceItems,
  collectionReceived,
}: Props) => {
  const totalInvoiceRaised = getTotalInvoiceRaised(invoiceItems);

  const balanceRemaining = getBalanceAmount(
    workOrderValueINR,
    totalInvoiceRaised
  );

  const completionPercentage = getInvoiceCompletionPercentage(
    workOrderValueINR,
    totalInvoiceRaised
  );

  const invoiceCount = getInvoiceCount(invoiceItems);

  const outstandingCollection = getOutstandingCollection(
    totalInvoiceRaised,
    collectionReceived
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={<IndianRupee size={18} strokeWidth={2.25} />}
        label="Total Project Value"
        value={formatIndianCurrency(workOrderValueINR)}
        accent="blue"
      />

      <KpiCard
        icon={<FileText size={18} strokeWidth={2.25} />}
        label="Total Invoice Raised"
        value={formatIndianCurrency(totalInvoiceRaised)}
        accent="purple"
      />

      <KpiCard
        icon={<Wallet size={18} strokeWidth={2.25} />}
        label="Balance Remaining"
        value={formatIndianCurrency(balanceRemaining)}
        accent="orange"
      />

      <KpiCard
        icon={<TrendingUp size={18} strokeWidth={2.25} />}
        label="Invoice Completion %"
        value={`${completionPercentage.toFixed(2)}%`}
        accent="green"
      />

      <KpiCard
        icon={<FileText size={18} strokeWidth={2.25} />}
        label="Invoices Raised"
        value={String(invoiceCount)}
        accent="slate"
      />

      <KpiCard
        icon={<Clock size={18} strokeWidth={2.25} />}
        label="Outstanding Collection"
        value={formatIndianCurrency(outstandingCollection)}
        accent="red"
      />
    </div>
  );
};

export default InvoiceSummaryCards;
