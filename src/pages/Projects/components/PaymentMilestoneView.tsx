import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  ListChecks,
  PieChart,
  Wallet,
} from "lucide-react";
import type { Project } from "../../../types/Project";
import { isMilestoneBilled } from "../../../services/milestoneBillingService";

interface Props {
  project: Project;
}

type MilestoneStatus = "Upcoming" | "Due Today" | "Overdue";

const STATUS_BADGE_STYLES: Record<MilestoneStatus, string> = {
  Upcoming: "bg-green-50 text-green-700 border-green-200",
  "Due Today": "bg-orange-50 text-orange-700 border-orange-200",
  Overdue: "bg-red-50 text-red-700 border-red-200",
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

  const isPercentageMismatch =
    Math.abs(totalPaymentPercentage - 100) > 0.01;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Payment Milestones
          </h2>
          <p className="text-sm text-slate-500">
            Review project payment schedule.
          </p>
        </div>

        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-700">
          Payment Type: {project.paymentType}
        </span>
      </div>

      {isPercentageMismatch && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          <AlertTriangle size={16} strokeWidth={2.25} />
          Total payment percentage does not equal 100%.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ListChecks size={18} strokeWidth={2.25} />
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Payments
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {totalPayments}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <PieChart size={18} strokeWidth={2.25} />
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Payment %
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {totalPaymentPercentage.toFixed(2)}%
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <CircleDollarSign size={18} strokeWidth={2.25} />
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Remaining %
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {remainingPercentage.toFixed(2)}%
          </p>
        </div>

        <div className="rounded-2xl border border-green-200 bg-white p-5 shadow-sm ring-1 ring-green-100 transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
            <Wallet size={18} strokeWidth={2.25} />
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Amount
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {formatCurrency(totalAmount)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[28rem] overflow-auto rounded-xl border border-gray-100">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-16 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                Sl No
              </th>
              <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">
                Milestone Name
              </th>
              <th className="w-28 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                Payment %
              </th>
              <th className="w-32 border-b border-slate-200 px-3 py-3 text-left font-semibold">
                Due Date
              </th>
              <th className="w-36 border-b border-slate-200 px-3 py-3 text-left font-semibold">
                Days Left
              </th>
              <th className="w-32 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                Status
              </th>
              <th className="w-32 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                Billing Status
              </th>
              <th className="w-40 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {milestones.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  No payment milestones have been added for this project.
                </td>
              </tr>
            ) : (
              milestones.map((milestone, index) => {
                const daysLeft = getDaysDifference(milestone.dueDate);
                const status = getStatus(daysLeft);
                const billed = isMilestoneBilled(project, milestone.id);

                return (
                  <tr
                    key={milestone.id}
                    className="bg-white transition-colors duration-150 hover:bg-slate-50"
                  >
                    <td className="px-3 py-3 text-center text-slate-500">
                      {index + 1}
                    </td>

                    <td className="px-3 py-3 font-medium text-slate-800">
                      {milestone.milestoneName?.trim() || `Milestone ${index + 1}`}
                    </td>

                    <td className="px-3 py-3 text-right font-medium text-slate-700">
                      {(milestone.paymentPercentage || 0).toFixed(2)}%
                    </td>

                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <CalendarClock
                          size={14}
                          className="shrink-0 text-blue-600"
                        />
                        {formatDate(milestone.dueDate)}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-slate-600">
                      {getDaysLeftLabel(daysLeft)}
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_STYLES[status]}`}
                      >
                        {status}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                          billed
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-gray-200 bg-gray-100 text-gray-600"
                        }`}
                      >
                        {billed ? "Completed" : "Pending"}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right">
                      <span className="text-base font-bold text-green-600">
                        {formatCurrency(
                          (project.workOrderValueINR * (milestone.paymentPercentage || 0)) / 100
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PaymentMilestoneView;