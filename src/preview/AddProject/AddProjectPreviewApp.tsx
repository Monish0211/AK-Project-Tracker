import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, CreditCard, LayoutGrid, Lock, Moon, Package, Save, Sparkles, Sun, Wallet, X } from "lucide-react";
import "./add-project-preview-theme.css";

import type { Project } from "../../types/Project";
import { createEmptyProject } from "../../utils/createEmptyProject";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "../../components/ui/Button";

import GeneralInfoCardPreview from "./GeneralInfoCardPreview";
import QuantityCardPreview from "./QuantityCardPreview";
import PaymentMilestoneCardPreview from "./PaymentMilestoneCardPreview";
import ExpenseBudgetCardPreview from "./ExpenseBudgetCardPreview";

type TabKey = "general" | "quantity" | "payments" | "budget";

const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "general", label: "General", icon: LayoutGrid },
  { key: "quantity", label: "Quantity", icon: Package },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "budget", label: "Expense Budget", icon: Wallet },
];

const PREVIEW_NOTICE = "Preview mode — this is a presentation-only mockup. No project is saved.";

const AddProjectPreviewApp = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [project, setProject] = useState<Project>(() => createEmptyProject());
  const [activeTab, setActiveTab] = useState<TabKey>(TABS[0].key);
  const [unlockedIndex, setUnlockedIndex] = useState(0);

  const activeIndex = TABS.findIndex((t) => t.key === activeTab);
  const isLastTab = activeIndex === TABS.length - 1;
  const isFirstTab = activeIndex === 0;

  const goNext = () => {
    if (isLastTab) return;
    const nextIndex = activeIndex + 1;
    setUnlockedIndex((prev) => Math.max(prev, nextIndex));
    setActiveTab(TABS[nextIndex].key);
  };

  const goBack = () => {
    if (!isFirstTab) setActiveTab(TABS[activeIndex - 1].key);
  };

  return (
    <div className="add-project-preview-shell min-h-screen flex flex-col">
      <header className="h-14 flex items-center justify-between gap-3 px-4 border-b shrink-0" style={{ background: "var(--nu-surface)", borderColor: "var(--nu-border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} className="text-[var(--nu-accent)] shrink-0" />
          <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate">
            Design Preview — Add Project wizard redesign, not saved, not production
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] flex items-center justify-center text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={() => navigate("/projects/add")}
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
          >
            <X size={13} />
            Exit Preview
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto nu-scrollbar p-4 space-y-3.5 nu-fade-in">
        {/* Header */}
        <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
              <Package size={20} />
            </div>
            <div>
              <h1 className="text-[19px] font-bold text-[var(--nu-text)]">Add New Project</h1>
              <p className="text-[12.5px] text-[var(--nu-text-muted)]">
                Enter project information across General, Quantity, Payments and Expense Budget.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-5 gap-y-2.5 mt-4 pt-3.5 border-t border-[var(--nu-border)]">
            {[
              { label: "PR Number", value: project.prNo },
              { label: "Client", value: project.client },
              { label: "Project Title", value: project.projectTitle },
              { label: "Department", value: project.department },
              { label: "Status", value: project.projectStatus },
              { label: "Contract Type", value: project.contractType },
              { label: "WO Value", value: project.workOrderValueINR ? `₹${project.workOrderValueINR.toLocaleString("en-IN")}` : "" },
            ].map((field) => (
              <div key={field.label} className="min-w-0">
                <p className="text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] font-medium">{field.label}</p>
                <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate">{field.value || "—"}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky segmented tab nav */}
        <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] overflow-hidden">
          <div className="sticky top-0 z-10 bg-[var(--nu-surface)] border-b border-[var(--nu-border)] px-3 py-2 overflow-x-auto nu-scrollbar">
            <div className="flex gap-1.5 min-w-max">
              {TABS.map(({ key, label, icon: Icon }, index) => {
                const isActive = activeTab === key;
                const isLocked = index > unlockedIndex;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isLocked}
                    title={isLocked ? "Complete the previous step to unlock this tab" : undefined}
                    onClick={() => {
                      if (!isLocked) setActiveTab(key);
                    }}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] text-[12.5px] font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-[var(--nu-accent)] text-white shadow-[var(--nu-shadow-sm)]"
                        : isLocked
                        ? "text-[var(--nu-text-muted)] cursor-not-allowed"
                        : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
                    }`}
                  >
                    {isLocked ? <Lock size={14} /> : <Icon size={15} strokeWidth={2.25} />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4">
            {activeTab === "general" && <GeneralInfoCardPreview project={project} setProject={setProject} />}
            {activeTab === "quantity" && <QuantityCardPreview project={project} setProject={setProject} />}
            {activeTab === "payments" && <PaymentMilestoneCardPreview project={project} setProject={setProject} />}
            {activeTab === "budget" && <ExpenseBudgetCardPreview project={project} setProject={setProject} />}
          </div>
        </div>
      </main>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 bg-[var(--nu-surface)]/95 backdrop-blur-md border-t border-[var(--nu-border)] py-3 px-4 flex justify-between items-center shadow-[var(--nu-shadow-md)] shrink-0">
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowLeft size={14} />}
          onClick={() => (isFirstTab ? navigate("/projects/add") : goBack())}
        >
          Back
        </Button>

        <div className="flex gap-2">
          {!isLastTab && (
            <Button variant="outline" size="sm" icon={<ChevronRight size={14} />} onClick={goNext} className="flex-row-reverse">
              Save & Next
            </Button>
          )}

          {isLastTab && (
            <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={() => alert(PREVIEW_NOTICE)}>
              Save Project
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddProjectPreviewApp;
