import { useEffect, useState } from "react";
import {
  Pencil,
  Plus,
  LayoutGrid,
  Package,
  CreditCard,
  Building2,
  Hash,
  Briefcase,
  Layers,
  Activity,
  IndianRupee,
  Users,
  Wallet,
  Receipt,
  Lock,
} from "lucide-react";

import type { Project } from "../../../types/Project";
import type { Dispatch, SetStateAction } from "react";

import GeneralInfoCard from "./GeneralInfoCard";
import QuantityCard from "./QuantityCard";
import CommercialCard from "./PaymentMilestoneCard";
import TeamAssignedCard from "./TeamAssignedCard";
import FormButtons from "./FormButtons";
import ExpenseBudgetCard from "./ExpenseBudgetCard";
import InvoiceCard from "./InvoiceCard";
import NonManhourExpenseCard from "./ExpenseInformation/NonManhourExpenseCard";
import { syncInvoiceItemsWithQuantity } from "../../../services/invoiceSyncService";

// All possible tab keys
export type TabKey = "general" | "quantity" | "payments" | "budget" | "team" | "expenses" | "invoices";

interface TabConfig {
  key: TabKey;
  label: string;
  icon: typeof LayoutGrid;
}

// Add Project: 4 tabs — no team assigned, no expenses register, no invoices
const TABS_ADD: TabConfig[] = [
  { key: "general", label: "General", icon: LayoutGrid },
  { key: "quantity", label: "Quantity", icon: Package },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "budget", label: "Expense Budget", icon: Wallet },
];

// Edit Project: 7 tabs — full execution workflow
const TABS_EDIT: TabConfig[] = [
  { key: "general", label: "General", icon: LayoutGrid },
  { key: "quantity", label: "Quantity", icon: Package },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "budget", label: "Expense Budget", icon: Wallet },
  { key: "team", label: "Team Assigned", icon: Users },
  { key: "expenses", label: "Other Project Expenses", icon: Briefcase },
  { key: "invoices", label: "Invoices", icon: Receipt },
];

const formatINR = (value: number): string =>
  `₹${(value || 0).toLocaleString("en-IN")}`;

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  mode: "add" | "edit";
  /** Tab to open on initial render — used to restore the tab the user was viewing before switching to Edit. */
  initialTab?: TabKey;
}

const ProjectForm = ({ project, setProject, mode, initialTab }: Props) => {
  const TABS = mode === "add" ? TABS_ADD : TABS_EDIT;
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialTab && TABS.some((tab) => tab.key === initialTab)
      ? initialTab
      : TABS[0].key
  );

  const activeIndex = TABS.findIndex((tab) => tab.key === activeTab);
  const isLastTab = activeIndex === TABS.length - 1;
  const isFirstTab = activeIndex === 0;

  // Add Project behaves as a guided wizard: only General is unlocked until
  // each step is saved. Edit Project stays fully navigable — the project
  // already exists, and this preserves jumping straight to a specific tab
  // (e.g. from View Project).
  const [unlockedIndex, setUnlockedIndex] = useState(
    mode === "add" ? 0 : TABS.length - 1
  );

  const goToNextTab = () => {
    if (activeIndex < TABS.length - 1) {
      const nextIndex = activeIndex + 1;
      setUnlockedIndex((prev) => Math.max(prev, nextIndex));
      setActiveTab(TABS[nextIndex].key);
    }
  };

  const goToPreviousTab = () => {
    if (activeIndex > 0) {
      setActiveTab(TABS[activeIndex - 1].key);
    }
  };

  // Keep Invoice line items synchronized with Quantity Details activities
  // (description, qty, uom, unit price) while the user is editing.
  useEffect(() => {
    setProject((prev) => {
      const synced = syncInvoiceItemsWithQuantity(
        prev.quantityItems,
        prev.invoiceItems
      );

      if (JSON.stringify(synced) === JSON.stringify(prev.invoiceItems)) {
        return prev;
      }

      return { ...prev, invoiceItems: synced };
    });
  }, [project.quantityItems, setProject]);

  return (
    <div className="space-y-6">
      {/* ================= Header ================= */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
            {mode === "add" ? (
              <Plus size={28} className="text-blue-600" />
            ) : (
              <Pencil size={28} className="text-blue-600" />
            )}
          </div>

          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              {mode === "add" ? "Add New Project" : "Edit Project"}
            </h1>

            <p className="text-gray-500 mt-1">
              {mode === "add"
                ? "Enter complete project information including quantities, payments and team assignment."
                : "Update project information including quantities, payment milestones, expenses and invoices."}
            </p>
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
                {formatINR(project.workOrderValueINR || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ================= Tabs ================= */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100">
        <div className="p-4 border-b border-gray-100 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {TABS.map(({ key, label, icon: Icon }, index) => {
              const isActive = activeTab === key;
              const isLocked = index > unlockedIndex;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isLocked}
                  aria-disabled={isLocked}
                  title={
                    isLocked
                      ? "Complete the previous step to unlock this tab"
                      : undefined
                  }
                  onClick={() => {
                    if (!isLocked) setActiveTab(key);
                  }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : isLocked
                      ? "bg-white text-gray-300 cursor-not-allowed"
                      : "bg-white text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                  }`}
                >
                  {isLocked ? (
                    <Lock size={16} strokeWidth={2.25} />
                  ) : (
                    <Icon size={16} strokeWidth={2.25} />
                  )}
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

          {activeTab === "budget" && (
            <ExpenseBudgetCard project={project} setProject={setProject} />
          )}

          {activeTab === "team" && (
            <TeamAssignedCard project={project} onChange={setProject} />
          )}

          {activeTab === "expenses" && (
            <NonManhourExpenseCard project={project} setProject={setProject} />
          )}

          {activeTab === "invoices" && (
            <InvoiceCard project={project} setProject={setProject} />
          )}
        </div>
      </div>

      {/* ================= Form Buttons (always visible) ================= */}
      <div>
        <FormButtons
          project={project}
          setProject={setProject}
          mode={mode}
          activeTab={activeTab}
          isLastTab={isLastTab}
          isFirstTab={isFirstTab}
          onSaveAndNext={goToNextTab}
          onBack={goToPreviousTab}
        />
      </div>
    </div>
  );
};

export default ProjectForm;
