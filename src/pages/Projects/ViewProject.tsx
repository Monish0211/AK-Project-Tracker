import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Building2,
  Briefcase,
  CalendarRange,
  Clock,
  Eye,
  Hash,
  IndianRupee,
  Layers,
  Pencil,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { getProjectById } from "../../services/projectService";
import {
  getGrossProfit,
  getProfitMargin,
  getTotalProjectCost,
} from "../../services/expenseService";

import GeneralView from "./components/GeneralView";
import QuantityTable from "./components/QuantityTable";
import PaymentMilestoneView from "./components/PaymentMilestoneView";
import ManhourExpenseView from "./components/ManhourExpenseView";
import NonManhourExpenseView from "./components/NonManhourExpenseView";
import CostSummaryCard from "./components/ExpenseInformation/CostSummaryCard";
import ProfitAnalysisCard from "./components/ExpenseInformation/ProfitAnalysisCard";
import InvoiceProgressView from "./components/InvoiceProgressView";
import TeamAssignedView from "./components/TeamAssignedView";

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  accent: "blue" | "green" | "orange" | "purple" | "slate" | "red";
}

const ACCENT_STYLES: Record<KpiCardProps["accent"], { bg: string; text: string }> = {
  blue: { bg: "bg-blue-50", text: "text-blue-600" },
  green: { bg: "bg-green-50", text: "text-green-600" },
  orange: { bg: "bg-orange-50", text: "text-orange-600" },
  purple: { bg: "bg-purple-50", text: "text-purple-600" },
  slate: { bg: "bg-slate-50", text: "text-slate-600" },
  red: { bg: "bg-red-50", text: "text-red-600" },
};

const KpiCard = ({ icon, label, value, accent }: KpiCardProps) => {
  const styles = ACCENT_STYLES[accent];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${styles.bg} ${styles.text}`}>
        {icon}
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
};

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
    {children}
  </h2>
);

const STATUS_ACCENT: Record<string, KpiCardProps["accent"]> = {
  Active: "green",
  Completed: "blue",
  "On Hold": "orange",
  Cancelled: "red",
};

const formatINR = (value: number): string =>
  `₹${(value || 0).toLocaleString("en-IN")}`;

const formatShortDate = (value: string): string => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const ViewProject = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="text-center mt-10">
        Invalid Project Id
      </div>
    );
  }

  const project = getProjectById(id);

  if (!project) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-3xl font-bold text-red-600 mb-4">
          Project Not Found
        </h1>

        <button
          onClick={() => navigate("/projects")}
          className="px-5 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  // -------- Health Dashboard calculations (reusing existing services) --------

  const totalProjectCost = getTotalProjectCost(
    project.manhourExpenses,
    project.nonManhourExpenses
  );

  const grossProfit = getGrossProfit(project.workOrderValue, totalProjectCost);

  const profitMargin = getProfitMargin(project.workOrderValue, grossProfit);

  const hasRevenue = project.workOrderValue > 0;

  const isProfit = grossProfit >= 0;

  const hasWoQty = project.totalWOQty > 0;

  const pendingQtyPercentage = hasWoQty
    ? (project.totalPendingQty / project.totalWOQty) * 100
    : 0;

  const hasDuration =
    Boolean(project.projectStartDate) && Boolean(project.projectEndDate);

  const durationLabel = hasDuration
    ? `${formatShortDate(project.projectStartDate)} → ${formatShortDate(
        project.projectEndDate
      )}`
    : "—";

  const statusAccent = STATUS_ACCENT[project.projectStatus] ?? "slate";

  return (
    <div className="space-y-8">
      {/* ================= Header ================= */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex justify-between items-center">
          {/* Left */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
              <Eye size={28} className="text-blue-600" />
            </div>

            <div>
              <h1 className="text-3xl font-bold text-slate-800">
                View Project
              </h1>

              <p className="text-gray-500 mt-1">
                Read-only executive summary of quantities, payment
                milestones and expenses.
              </p>
            </div>
          </div>

          {/* Right */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/projects")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-300 hover:bg-gray-50 transition"
            >
              <ArrowLeft size={18} />
              Back
            </button>

            <button
              onClick={() => navigate(`/projects/edit/${project.id}`)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition"
            >
              <Pencil size={18} />
              Edit Project
            </button>
          </div>
        </div>
      </div>

      {/* ================= Project Health Dashboard ================= */}
      <div className="space-y-4">
        <SectionLabel>Project Health Dashboard</SectionLabel>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
          <KpiCard
            icon={<Activity size={22} strokeWidth={2.25} />}
            label="Project Status"
            value={project.projectStatus || "—"}
            accent={statusAccent}
          />

          <KpiCard
            icon={<IndianRupee size={22} strokeWidth={2.25} />}
            label="Work Order Value"
            value={formatINR(project.workOrderValue)}
            accent="blue"
          />

          <KpiCard
            icon={<Wallet size={22} strokeWidth={2.25} />}
            label="Total Project Expenses"
            value={formatINR(totalProjectCost)}
            accent="red"
          />

          <KpiCard
            icon={
              isProfit ? (
                <TrendingUp size={22} strokeWidth={2.25} />
              ) : (
                <TrendingDown size={22} strokeWidth={2.25} />
              )
            }
            label="Profit Margin"
            value={hasRevenue ? `${profitMargin.toFixed(2)}%` : "—"}
            accent={hasRevenue ? (isProfit ? "green" : "red") : "slate"}
          />

          <KpiCard
            icon={<Clock size={22} strokeWidth={2.25} />}
            label="Pending Quantity %"
            value={hasWoQty ? `${pendingQtyPercentage.toFixed(2)}%` : "—"}
            accent="orange"
          />

          <KpiCard
            icon={<CalendarRange size={22} strokeWidth={2.25} />}
            label="Project Duration"
            value={durationLabel}
            accent="slate"
          />
        </div>
      </div>

      {/* ================= Project Overview ================= */}
      <div className="space-y-4">
        <SectionLabel>Project Overview</SectionLabel>

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Hash size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">PR Number</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {project.prNo || "-"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Building2 size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Client</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {project.client || "-"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 sm:col-span-2 lg:col-span-2">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Briefcase size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Project Title</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {project.projectTitle || "-"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Layers size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">PR Category</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {project.prCategory || "-"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Layers size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Department</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {project.department || "-"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Activity size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Project Status</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {project.projectStatus || "-"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <IndianRupee size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Work Order Value</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {formatINR(project.workOrderValue)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= General Information ================= */}
      <GeneralView project={project} />

      {/* ================= Quantity Summary ================= */}
      <div className="space-y-4">
        <SectionLabel>Quantity Summary</SectionLabel>
        <QuantityTable project={project} />
      </div>

      {/* ================= Payment Milestones ================= */}
      <div className="space-y-4">
        <SectionLabel>Payment Milestones</SectionLabel>
        <PaymentMilestoneView project={project} />
      </div>

      {/* ================= Team Assigned ================= */}
      <div className="space-y-4">
        <SectionLabel>Team Assigned</SectionLabel>
        <TeamAssignedView project={project} />
      </div>

      {/* ================= Expense Information ================= */}
      <div className="space-y-4">
        <SectionLabel>Expense Information</SectionLabel>

        <div className="space-y-6">
          <ManhourExpenseView expenses={project.manhourExpenses} />
          <NonManhourExpenseView expenses={project.nonManhourExpenses} />
        </div>
      </div>

      {/* ================= Cost Summary & Profit Analysis ================= */}
      <div className="space-y-4">
        <SectionLabel>Cost Summary &amp; Profit Analysis</SectionLabel>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <CostSummaryCard
            manhourExpenses={project.manhourExpenses}
            nonManhourExpenses={project.nonManhourExpenses}
          />

          <ProfitAnalysisCard
            manhourExpenses={project.manhourExpenses}
            nonManhourExpenses={project.nonManhourExpenses}
            revenue={project.workOrderValue}
          />
        </div>
      </div>

      {/* ================= Invoice Progress ================= */}
      <div className="space-y-4">
        <SectionLabel>Invoice Progress</SectionLabel>
        <InvoiceProgressView project={project} />
      </div>
    </div>
  );
};

export default ViewProject;
