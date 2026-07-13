import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarRange,
  Clock,
  CreditCard,
  Eye,
  IndianRupee,
  LayoutGrid,
  Package,
  Pencil,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
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
import ExpenseBudgetView from "./components/ExpenseBudgetView";
import TeamAssignedView from "./components/TeamAssignedView";
import NonManhourExpenseView from "./components/NonManhourExpenseView";
import InvoiceProgressView from "./components/InvoiceProgressView";

// ─── Small reusable components ────────────────────────────────────────────────

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
      <p
        className="mt-1.5 text-xl sm:text-2xl font-bold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis"
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
};

// ─── Tabs config ──────────────────────────────────────────────────────────────

type TabKey = "general" | "quantity" | "payments" | "budget" | "team" | "expenses" | "invoices";

interface TabConfig {
  key: TabKey;
  label: string;
  icon: typeof LayoutGrid;
}

const TABS: TabConfig[] = [
  { key: "general",   label: "General",                 icon: LayoutGrid },
  { key: "quantity",  label: "Quantity",                 icon: Package    },
  { key: "payments",  label: "Payments",                 icon: CreditCard },
  { key: "budget",    label: "Expense Budget",           icon: Wallet     },
  { key: "team",      label: "Team Assigned",            icon: Users      },
  { key: "expenses",  label: "Other Project Expenses",   icon: Briefcase  },
  { key: "invoices",  label: "Invoices",                 icon: Receipt    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_ACCENT: Record<string, KpiCardProps["accent"]> = {
  "Not Started": "slate",
  Pending: "blue",
  Completed: "green",
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

// ─── Main component ───────────────────────────────────────────────────────────

const ViewProject = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>(TABS[0].key);

  if (!id) {
    return <div className="text-center mt-10">Invalid Project Id</div>;
  }

  const project = getProjectById(id);

  if (!project) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-3xl font-bold text-red-600 mb-4">Project Not Found</h1>
        <button
          onClick={() => navigate("/projects")}
          className="px-5 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  // ── Health Dashboard calculations ──────────────────────────────────────────
  const totalProjectCost = getTotalProjectCost(
    project.manhourExpenses,
    project.nonManhourExpenses
  );
  const grossProfit    = getGrossProfit(project.workOrderValue, totalProjectCost);
  const profitMargin   = getProfitMargin(project.workOrderValue, grossProfit);
  const hasRevenue     = project.workOrderValue > 0;
  const isProfit       = grossProfit >= 0;
  const hasWoQty       = project.totalWOQty > 0;
  const pendingQtyPercentage = hasWoQty
    ? (project.totalPendingQty / project.totalWOQty) * 100
    : 0;
  const hasDuration = Boolean(project.projectStartDate) && Boolean(project.projectEndDate);
  const durationLabel = hasDuration
    ? `${formatShortDate(project.projectStartDate)} → ${formatShortDate(project.projectEndDate)}`
    : "—";
  const statusAccent = STATUS_ACCENT[project.projectStatus] ?? "slate";

  // ── Tab navigation helpers ─────────────────────────────────────────────────
  const activeIndex = TABS.findIndex((t) => t.key === activeTab);
  const isLastTab   = activeIndex === TABS.length - 1;
  const isFirstTab  = activeIndex === 0;

  const goNext = () => {
    if (!isLastTab) setActiveTab(TABS[activeIndex + 1].key);
  };

  const goBack = () => {
    if (isFirstTab) {
      navigate("/projects");
    } else {
      setActiveTab(TABS[activeIndex - 1].key);
    }
  };

  return (
    <div className="space-y-8">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
            <Eye size={28} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">View Project</h1>
            <p className="text-gray-500 mt-1">
              Read-only executive summary of the project.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Project Health Dashboard (always visible) ───────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Project Health Dashboard
        </h2>

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

      {/* ─── Tabbed Section ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100">
        {/* Tab bar */}
        <div className="p-4 border-b border-gray-100 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {TABS.map(({ key, label, icon: Icon }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-white text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                  }`}
                >
                  <Icon size={16} strokeWidth={2.25} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === "general"  && <GeneralView project={project} />}
          {activeTab === "quantity" && <QuantityTable project={project} />}
          {activeTab === "payments" && <PaymentMilestoneView project={project} />}
          {activeTab === "budget"   && <ExpenseBudgetView project={project} />}
          {activeTab === "team"     && <TeamAssignedView project={project} />}
          {activeTab === "expenses" && (
            <NonManhourExpenseView expenses={project.nonManhourExpenses} />
          )}
          {activeTab === "invoices" && <InvoiceProgressView project={project} />}
        </div>
      </div>

      {/* ─── Sticky Bottom Action Bar ─────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-gray-200 py-4 px-6 flex justify-between items-center shadow-lg -mx-6 mt-8 z-40">
        {/* Left */}
        <button
          onClick={goBack}
          className="flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-300 hover:bg-gray-50 text-slate-700 transition font-semibold"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        {/* Right */}
        <div className="flex gap-3">
          {!isLastTab && (
            <button
              onClick={goNext}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-blue-600 text-blue-600 hover:bg-blue-50 transition font-semibold"
            >
              Next
              <ArrowRight size={18} />
            </button>
          )}

          <button
            onClick={() =>
              navigate(`/projects/edit/${project.id}`, {
                state: { tab: activeTab },
              })
            }
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition font-semibold shadow-md"
          >
            <Pencil size={18} />
            Edit Project
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewProject;
