import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Eye,
  ArrowLeft,
  Pencil,
  LayoutGrid,
  Package,
  CreditCard,
  Receipt,
  Wallet,
  FolderOpen,
  Users,
  Building2,
  Hash,
  Briefcase,
  Layers,
  Activity,
  IndianRupee,
  TrendingUp,
  Clock,
} from "lucide-react";

import { getProjectById } from "../../services/projectService";

import GeneralView from "./components/GeneralView";
import QuantityTable from "./components/QuantityTable";
import BillingSection from "./components/BillingSection";
import CostSection from "./components/CostSection";
import DocumentsSection from "./components/DocumentsSection";
import TeamSection from "./components/TeamSection";
import PaymentMilestoneView from "./components/PaymentMilestoneView";

type TabKey =
  | "general"
  | "quantity"
  | "payments"
  | "invoices"
  | "expenses"
  | "documents"
  | "team";

interface TabConfig {
  key: TabKey;
  label: string;
  icon: typeof LayoutGrid;
}

const TABS: TabConfig[] = [
  { key: "general", label: "General", icon: LayoutGrid },
  { key: "quantity", label: "Quantity", icon: Package },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "expenses", label: "Expenses", icon: Wallet },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "team", label: "Team", icon: Users },
];

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  accent: "blue" | "green" | "orange" | "purple" | "slate";
}

const ACCENT_STYLES: Record<KpiCardProps["accent"], { bg: string; text: string }> = {
  blue: { bg: "bg-blue-50", text: "text-blue-600" },
  green: { bg: "bg-green-50", text: "text-green-600" },
  orange: { bg: "bg-orange-50", text: "text-orange-600" },
  purple: { bg: "bg-purple-50", text: "text-purple-600" },
  slate: { bg: "bg-slate-50", text: "text-slate-600" },
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

const formatINR = (value: number): string =>
  `₹${(value || 0).toLocaleString("en-IN")}`;

const ViewProject = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("general");

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

  return (
    <div className="space-y-6">
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
                Review complete project information including quantities, payment milestones, invoices, expenses, documents and project team.
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

      {/* ================= Project Summary Card ================= */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-5">
          Project Summary
        </h2>

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

      {/* ================= Summary KPI Cards ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        <KpiCard
          icon={<IndianRupee size={22} strokeWidth={2.25} />}
          label="Project Value"
          value={formatINR(project.workOrderValue)}
          accent="blue"
        />

        <KpiCard
          icon={<Receipt size={22} strokeWidth={2.25} />}
          label="Invoice Raised"
          value={formatINR(project.invoiceRaisedINR)}
          accent="purple"
        />

        <KpiCard
          icon={<Clock size={22} strokeWidth={2.25} />}
          label="Outstanding"
          value={formatINR(project.outstandingINR)}
          accent="orange"
        />

        <KpiCard
          icon={<TrendingUp size={22} strokeWidth={2.25} />}
          label="Collection Received"
          value={formatINR(project.paymentReceivedINR)}
          accent="green"
        />

        <KpiCard
          icon={<Package size={22} strokeWidth={2.25} />}
          label="Pending Qty"
          value={String(project.totalPendingQty ?? 0)}
          accent="slate"
        />
      </div>

      {/* ================= Tabs ================= */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100">
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

        <div className="p-6">
          {activeTab === "general" && <GeneralView project={project} />}

          {activeTab === "quantity" && (
            <QuantityTable items={project.quantityItems} />
          )}

          {activeTab === "payments" && (
  <PaymentMilestoneView project={project} />
)}

          {activeTab === "invoices" && <BillingSection project={project} />}

          {activeTab === "expenses" && <CostSection project={project} />}

          {activeTab === "documents" && (
            <DocumentsSection project={project} />
          )}

          {activeTab === "team" && <TeamSection project={project} />}
        </div>
      </div>
    </div>
  );
};

export default ViewProject;