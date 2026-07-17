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
  Check,
} from "lucide-react";

import type { Project } from "../../../types/Project";
import type { Dispatch, SetStateAction } from "react";

import GeneralInfoCard from "./GeneralInfoCard";
import QuantityCard from "./QuantityCard";
import CommercialCard from "./PaymentMilestoneCard";
import ExpandableTeamMembersCard from "./ExpandableTeamMembersCard";
import FormButtons from "./FormButtons";
import ExpenseBudgetCard from "./ExpenseBudgetCard";
import InvoiceCard from "./InvoiceCard";
import NonManhourExpenseCard from "./ExpenseInformation/NonManhourExpenseCard";
import { syncInvoiceItemsWithQuantity } from "../../../services/invoiceSyncService";
import { ProjectNotesDrawer } from "../../../components/Dashboard/ProjectNotesDrawer";
import "../project-workspace-theme.css";

// All possible tab keys
export type TabKey = "general" | "quantity" | "payments" | "budget" | "team" | "expenses" | "invoices";

interface TabConfig {
  key: TabKey;
  label: string;
  icon: typeof LayoutGrid;
}

// Add Project: 4 tabs (remove team assigned)
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
  const [isNotesOpen, setIsNotesOpen] = useState(false);
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

  const overviewFields = [
    { label: "PR Number", value: project.prNo, icon: Hash },
    { label: "Client", value: project.client, icon: Building2 },
    { label: "Project Title", value: project.projectTitle, icon: Briefcase },
    { label: "PR Category", value: project.prCategory, icon: Layers },
    { label: "Department", value: project.department, icon: Layers },
    { label: "Project Status", value: project.projectStatus, icon: Activity },
    {
      label: "Work Order Value",
      value: project.workOrderValueINR ? formatINR(project.workOrderValueINR) : "",
      icon: IndianRupee,
    },
  ];

  return (
    <div className="project-form-shell -m-6 p-4 space-y-3.5 nu-fade-in">
      {/* ================= Header ================= */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
              {mode === "add" ? <Plus size={20} /> : <Pencil size={20} />}
            </div>

            <div className="min-w-0">
              <h1 className="text-[19px] font-bold text-[var(--nu-text)] leading-tight">
                {mode === "add" ? "Add New Project" : "Edit Project"}
              </h1>
              <p className="text-[12.5px] text-[var(--nu-text-muted)] mt-0.5">
                {mode === "add"
                  ? "Enter project information across General, Quantity, Payments, and Expense Budget."
                  : "Update project information including quantities, payment milestones, expenses, team assignments, and invoices."}
              </p>
            </div>
          </div>

          {mode === "edit" && (
            <button
              type="button"
              onClick={() => setIsNotesOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] font-semibold bg-[var(--nu-accent)] hover:bg-[var(--nu-accent-strong)] text-white shadow-[var(--nu-shadow-sm)] transition-colors self-start sm:self-auto text-[12.5px] shrink-0"
            >
              <span>📝</span>
              <span>Project Notes</span>
              <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-[11px] font-bold ml-0.5">
                {project.notes?.length || 0}
              </span>
            </button>
          )}
        </div>

        {/* Compact live overview strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-5 gap-y-2.5 mt-4 pt-3.5 border-t border-[var(--nu-border)]">
          {overviewFields.map((field) => (
            <div key={field.label} className="min-w-0">
              <p className="text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] font-medium">
                {field.label}
              </p>
              <p
                className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate"
                title={field.value || undefined}
              >
                {field.value || "—"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ================= Sticky section navigator ================= */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)]">
        <div className="sticky top-0 z-20 bg-[var(--nu-surface)]/95 backdrop-blur-md border-b border-[var(--nu-border)] px-3 py-2.5 rounded-t-[var(--nu-radius-lg)]">
          <div className="flex items-center justify-between gap-3 mb-2 px-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
              Section progress
            </p>
            <p className="text-[11.5px] font-semibold text-[var(--nu-text-secondary)]">
              Step {activeIndex + 1} of {TABS.length}
            </p>
          </div>

          {/* Progress bar */}
          <div className="h-1 rounded-full bg-[var(--nu-surface-alt)] mb-2.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--nu-accent)] transition-all duration-300"
              style={{
                width: `${((unlockedIndex + 1) / TABS.length) * 100}%`,
              }}
            />
          </div>

          <div className="flex gap-1.5 min-w-max overflow-x-auto nu-scrollbar pb-0.5">
            {TABS.map(({ key, label, icon: Icon }, index) => {
              const isActive = activeTab === key;
              const isLocked = index > unlockedIndex;
              const isComplete = index < unlockedIndex;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isLocked}
                  aria-disabled={isLocked}
                  aria-current={isActive ? "step" : undefined}
                  title={
                    isLocked
                      ? "Complete the previous step to unlock this tab"
                      : undefined
                  }
                  onClick={() => {
                    if (!isLocked) setActiveTab(key);
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] text-[12.5px] font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nu-accent)] ${
                    isActive
                      ? "bg-[var(--nu-accent)] text-white shadow-[var(--nu-shadow-sm)]"
                      : isLocked
                      ? "text-[var(--nu-text-muted)] cursor-not-allowed opacity-70"
                      : isComplete
                      ? "text-[var(--nu-success)] bg-[var(--nu-success-soft)] hover:opacity-90"
                      : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
                  }`}
                >
                  {isLocked ? (
                    <Lock size={14} />
                  ) : isComplete && !isActive ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : (
                    <Icon size={15} strokeWidth={2.25} />
                  )}
                  <span className="whitespace-nowrap">{label}</span>
                  {index < TABS.length - 1 && (
                    <span
                      className={`hidden sm:inline text-[10px] ml-0.5 ${
                        isActive ? "text-white/50" : "text-[var(--nu-text-muted)]"
                      }`}
                      aria-hidden
                    >
                      →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4">
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
            <ExpandableTeamMembersCard project={project} />
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

      {/* Project Notes Slide-over Drawer */}
      <ProjectNotesDrawer
        isOpen={isNotesOpen}
        onClose={() => setIsNotesOpen(false)}
        project={project}
        setProject={setProject}
      />
    </div>
  );
};

export default ProjectForm;
