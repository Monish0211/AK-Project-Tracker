import { useState } from "react";
import { FileText, LayoutGrid, Package, CreditCard, Wallet, Lock, Check } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";

import type { Project } from "../../types/Project";
import GeneralInfoCard from "../Projects/components/GeneralInfoCard";
import ProjectDocumentsCard from "../Projects/components/ProjectDocumentsCard";
import QuantityCard from "../Projects/components/QuantityCard";
import CommercialCard from "../Projects/components/PaymentMilestoneCard";
import ExpenseBudgetCard from "../Projects/components/ExpenseBudgetCard";
import RequestPRFormButtons from "./RequestPRFormButtons";
import PRRequestReviewFormButtons from "./PRRequestReviewFormButtons";
import { useFormValidation } from "../../hooks/useFormValidation";
import {
  validateGeneralTab,
  validateQuantityTab,
  validatePaymentMilestonesTab,
  validateExpenseBudgetTab,
} from "../../utils/projectValidation";
import "../Projects/project-workspace-theme.css";

/**
 * Request PR — deliberately built to LOOK AND BEHAVE like Add Project
 * (same header/step-progress shell, same four section cards, same field
 * widgets, same per-tab validation), because the data captured here becomes
 * real Project Repository data the moment it's approved — see
 * PRRequests.tsx and Backend's PRRequest model comment. The one real
 * difference from ProjectForm.tsx: there is no fifth "who approves this"
 * field anywhere in this form — Assigned PMO Manager is chosen later, as a
 * separate "Send to Accounts" action outside this form entirely (see
 * PRRequests.tsx) — and every tab's "Save & Next" only validates and
 * advances locally; nothing is persisted to the backend until "Save Draft"
 * on the last tab (see RequestPRFormButtons.tsx).
 */

type TabKey = "general" | "quantity" | "payments" | "budget";

interface TabConfig {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

const TABS: TabConfig[] = [
  { key: "general", label: "General", icon: LayoutGrid },
  { key: "quantity", label: "Quantity", icon: Package },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "budget", label: "Expense Budget", icon: Wallet },
];

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  draftId: string | null;
  /**
   * "draft" — the requester filling in/editing their own pre-submission
   * Draft (the original behavior): tabs unlock progressively, footer is
   * Save & Next / Save Draft. "review" — an Accounts/PMO Manager reviewing
   * an already-complete, already-submitted request: every tab is open from
   * the start (nothing to "unlock" — the data already exists), and the
   * footer is always Save / Reject / Approve regardless of which tab is
   * active. See PRRequestReviewFormButtons.tsx.
   */
  mode?: "draft" | "review";
  /** Required when mode is "review" — which stage's approval action Approve should call. */
  reviewStage?: "accounts" | "pmo";
}

const RequestPRForm = ({ project, setProject, draftId, mode = "draft", reviewStage }: Props) => {
  const isReview = mode === "review";
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [unlockedIndex, setUnlockedIndex] = useState(isReview ? TABS.length - 1 : 0);

  const activeIndex = TABS.findIndex((tab) => tab.key === activeTab);
  const isLastTab = activeIndex === TABS.length - 1;
  const isFirstTab = activeIndex === 0;

  const { errors, validate, clearError, clearAllErrors } = useFormValidation<Project>();

  const validateActiveTab = (tab: TabKey): boolean => {
    switch (tab) {
      case "general":
        return validate(project, validateGeneralTab);
      case "quantity":
        return validate(project, validateQuantityTab);
      case "payments":
        return validate(project, validatePaymentMilestonesTab);
      case "budget":
        return validate(project, validateExpenseBudgetTab);
      default:
        return true;
    }
  };

  const goToNextTab = () => {
    if (activeIndex < TABS.length - 1) {
      const nextIndex = activeIndex + 1;
      setUnlockedIndex((prev) => Math.max(prev, nextIndex));
      setActiveTab(TABS[nextIndex].key);
      clearAllErrors();
    }
  };

  const goToPreviousTab = () => {
    if (activeIndex > 0) {
      setActiveTab(TABS[activeIndex - 1].key);
      clearAllErrors();
    }
  };

  return (
    <div className="project-form-shell -m-6 p-4 space-y-3.5 nu-fade-in">
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
            <FileText size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[19px] font-bold text-[var(--nu-text)] leading-tight">
              {isReview ? "Review PR Request" : draftId ? "Edit PR Request Draft" : "New PR Request"}
            </h1>
            <p className="text-[12.5px] text-[var(--nu-text-muted)] mt-0.5">
              {isReview
                ? "Review the submitted data across every tab. You can correct anything before deciding — Save persists a correction without approving or rejecting."
                : "Enter project information across General, Quantity, Payments, and Expense Budget — the same fields Add Project captures. Saving here only creates a Draft; it never creates a Project and nobody is notified. Send this to Accounts for approval afterward from My Requests."}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)]">
        <div className="sticky top-0 z-20 bg-[var(--nu-surface)]/95 backdrop-blur-md border-b border-[var(--nu-border)] px-3 py-2.5 rounded-t-[var(--nu-radius-lg)]">
          <div className="flex items-center justify-between gap-3 mb-2 px-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Section progress</p>
            <p className="text-[11.5px] font-semibold text-[var(--nu-text-secondary)]">
              Step {activeIndex + 1} of {TABS.length}
            </p>
          </div>

          <div className="h-1 rounded-full bg-[var(--nu-surface-alt)] mb-2.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--nu-accent)] transition-all duration-300"
              style={{ width: `${((unlockedIndex + 1) / TABS.length) * 100}%` }}
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
                  title={isLocked ? "Complete the previous step to unlock this tab" : undefined}
                  onClick={() => {
                    // Review mode: free navigation between tabs — this is
                    // browsing already-submitted data, not progressing
                    // through a fill-in-order wizard, so it's never gated
                    // behind the current tab's own validation.
                    if (isLocked) return;
                    if (isReview || validateActiveTab(activeTab)) {
                      clearAllErrors();
                      setActiveTab(key);
                    }
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
                  {isLocked ? <Lock size={14} /> : isComplete && !isActive ? <Check size={14} strokeWidth={2.5} /> : <Icon size={15} strokeWidth={2.25} />}
                  <span className="whitespace-nowrap">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4">
          {activeTab === "general" && (
            <div className="space-y-3.5">
              <GeneralInfoCard
                project={project}
                setProject={setProject}
                errors={errors}
                clearError={clearError}
                showCustomerMasterWarning={false}
              />
              <ProjectDocumentsCard
                ownerType="prRequest"
                ownerId={draftId}
                lockedMessage="Save this Draft, then reopen it to upload documents."
              />
            </div>
          )}
          {activeTab === "quantity" && <QuantityCard project={project} setProject={setProject} errors={errors} clearError={clearError} />}
          {activeTab === "payments" && <CommercialCard project={project} setProject={setProject} errors={errors} clearError={clearError} />}
          {activeTab === "budget" && <ExpenseBudgetCard project={project} setProject={setProject} />}
        </div>
      </div>

      {isReview ? (
        <PRRequestReviewFormButtons project={project} prRequestId={draftId!} stage={reviewStage!} />
      ) : (
        <RequestPRFormButtons
          project={project}
          setProject={setProject}
          draftId={draftId}
          isLastTab={isLastTab}
          isFirstTab={isFirstTab}
          onValidate={() => validateActiveTab(activeTab)}
          onSaveAndNext={goToNextTab}
          onBack={goToPreviousTab}
        />
      )}
    </div>
  );
};

export default RequestPRForm;
