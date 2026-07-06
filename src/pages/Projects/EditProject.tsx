import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Pencil,
  LayoutGrid,
  Package,
  CreditCard,
  Receipt,
  Wallet,
  FolderOpen,
  Building2,
  Hash,
  Briefcase,
  Layers,
  Activity,
  IndianRupee,
} from "lucide-react";

import type { Project } from "../../types/Project";

import { createEmptyProject } from "../../utils/createEmptyProject";
import { getProjectById } from "../../services/projectService";

import GeneralInfoCard from "./components/GeneralInfoCard";
import QuantityCard from "./components/QuantityCard";
import CommercialCard from "./components/PaymentMilestoneCard";
import InvoiceCard from "./components/InvoiceCard";
import ExpenseCard from "./components/ExpenseCard";
import DocumentCard from "./components/DocumentCard";
import FormButtons from "./components/FormButtons";

type TabKey =
  | "general"
  | "quantity"
  | "payments"
  | "invoices"
  | "expenses"
  | "documents";

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
];

const formatINR = (value: number): string =>
  `₹${(value || 0).toLocaleString("en-IN")}`;

const EditProject = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const existingProject = id ? getProjectById(id) : undefined;

  const [project, setProject] = useState<Project>(
    existingProject ?? createEmptyProject()
  );

  const [activeTab, setActiveTab] = useState<TabKey>("general");

  const formButtonsRef = useRef<HTMLDivElement>(null);

  const handleSaveChangesClick = () => {
    formButtonsRef.current?.querySelector("button")?.click();
  };

  if (!existingProject) {
    return (
      <div className="bg-white rounded-xl shadow-md p-8">
        <h1 className="text-3xl font-bold text-red-600 mb-4">
          Project Not Found
        </h1>

        <button
          type="button"
          onClick={() => navigate("/projects")}
          className="px-5 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
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
              <Pencil size={28} className="text-blue-600" />
            </div>

            <div>
              <h1 className="text-3xl font-bold text-slate-800">
                Edit Project
              </h1>

              <p className="text-gray-500 mt-1">
                Update project information including quantities, payment
                milestones, invoices, expenses, documents and project team.
              </p>
            </div>
          </div>

          {/* Right */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-300 hover:bg-gray-50 transition"
            >
              <ArrowLeft size={18} />
              Back
            </button>

            <button
              type="button"
              onClick={handleSaveChangesClick}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition"
            >
              <Save size={18} />
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* ================= Project Overview Card ================= */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-5">
          Project Overview
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
              <p className="text-xs font-medium text-slate-400">
                Project Title
              </p>
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
              <p className="text-xs font-medium text-slate-400">
                PR Category
              </p>
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
              <p className="text-xs font-medium text-slate-400">
                Department
              </p>
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
              <p className="text-xs font-medium text-slate-400">
                Project Status
              </p>
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
              <p className="text-xs font-medium text-slate-400">
                Work Order Value
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {formatINR(project.workOrderValue)}
              </p>
            </div>
          </div>
        </div>
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
          {activeTab === "general" && (
            <GeneralInfoCard project={project} setProject={setProject} />
          )}

          {activeTab === "quantity" && (
            <QuantityCard project={project} setProject={setProject} />
          )}

          {activeTab === "payments" && (
            <CommercialCard project={project} setProject={setProject} />
          )}

          {activeTab === "invoices" && (
            <InvoiceCard project={project} setProject={setProject} />
          )}

          {activeTab === "expenses" && (
            <ExpenseCard project={project} setProject={setProject} />
          )}

          {activeTab === "documents" && (
            <DocumentCard project={project} setProject={setProject} />
          )}
        </div>
      </div>

      {/* ================= Form Buttons (always visible) ================= */}
      <div ref={formButtonsRef}>
        <FormButtons project={project} setProject={setProject} mode="edit" />
      </div>
    </div>
  );
};

export default EditProject;