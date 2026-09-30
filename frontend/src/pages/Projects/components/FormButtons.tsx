import { Save, RotateCcw, X, ArrowLeft, ChevronRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { Project } from "../../../types/Project";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { usePmoToast } from "../../../components/ui/usePmoToast";

import {
  addProject,
  updateProject,
  completeProject,
  getProjectById,
  createProjectGeneralInfo,
  updateProjectGeneralInfo,
} from "../../../services/projectService";
import { syncQuantityItemsWithApi } from "../../../services/quantityService";
import { syncMilestonesWithApi } from "../../../services/paymentMilestoneService";
import { syncExpensesWithApi, type ExpensesConcurrencySignal } from "../../../services/otherProjectExpenseService";
import { ApiError } from "../../../services/apiClient";
import { validateQuantityTab, validatePaymentMilestonesTab, validateOtherExpensesTab } from "../../../utils/projectValidation";

import { createEmptyProject } from "../../../utils/createEmptyProject";

/**
 * P0 fix — EditProject data-loss protection. `true` means that subresource's
 * initial load either failed or hasn't been confirmed yet this session;
 * `false` means it genuinely finished loading (including a legitimate empty
 * result). See EditProject.tsx's own comment on why the safe default is
 * `true`, never `false`. Only relevant in "edit" mode — "add" mode has no
 * pre-existing subresources to have failed loading, so its caller
 * (AddProject.tsx) never passes this prop at all.
 */
export interface SubresourceLoadStatus {
  quantity: boolean;
  milestones: boolean;
  expenses: boolean;
}

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  mode: "add" | "edit";
  activeTab: string;
  isLastTab: boolean;
  isFirstTab: boolean;
  onSaveAndNext: () => void;
  onBack: () => void;
  onValidate?: () => boolean;
  resourceLoadFailed?: SubresourceLoadStatus;
  /**
   * Add Project document staging (approved architecture — Option C).
   * Called right after a real Project id is obtained (both on first
   * creation and on any later Save & Next click that still finds
   * unresolved staged files) — uploads every staged file via the existing
   * Documents API and returns false if anything is still unresolved.
   * Only ProjectForm.tsx (mode="add") passes this; Edit Project never has
   * staged files to flush.
   */
  onFlushPendingDocuments?: (projectId: string) => Promise<boolean>;
  /** Clears staged (never-uploaded) documents when the user confirms Reset — mirrors setProject(createEmptyProject()) below. */
  onResetPendingDocuments?: () => void;
  /** Live "N of M" progress while onFlushPendingDocuments is running — surfaced on the Save/Save & Next button instead of a plain, indefinite "Saving...". */
  documentFlushProgress?: { completed: number; total: number } | null;
  /** Stale-save concurrency fix — ids the user explicitly clicked Delete on this session, tracked by ProjectForm.tsx (see NonManhourExpenseCard's onExpenseRemoved). The ONLY ids syncExpensesWithApi() is allowed to delete. */
  removedExpenseIds?: string[];
  /** Called once Other Project Expenses sync succeeds, so ProjectForm.tsx can reset removedExpenseIds back to [] for the next save cycle. */
  onExpensesSynced?: () => void;
  /** Captured once when Edit Project's initial expense load resolves (see EditProject.tsx) — the "before" snapshot the concurrency-warning banner compares against at Save time. Undefined/null in Add mode (nothing existed to snapshot). */
  expensesConcurrencyBaseline?: ExpensesConcurrencySignal | null;
}

const FormButtons = ({
  project,
  setProject,
  mode,
  activeTab,
  isLastTab,
  isFirstTab,
  onSaveAndNext,
  onBack,
  onValidate,
  resourceLoadFailed,
  onFlushPendingDocuments,
  onResetPendingDocuments,
  documentFlushProgress,
  removedExpenseIds,
  onExpensesSynced,
  expensesConcurrencyBaseline,
}: Props) => {
  const navigate = useNavigate();
  // The repository URL (page + filters) the user opened this project from,
  // passed through navigation state by Projects.tsx. Falls back to the plain
  // path for Add Project and for any deep link, where there is no repository
  // position to return to.
  const routerLocation = useLocation();
  const repositoryReturnUrl =
    (routerLocation.state as { returnTo?: string } | null)?.returnTo ?? "/projects";
  const { showToast } = usePmoToast();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  // Perf/robustness fix — Save/Save & Next previously had no in-flight
  // guard at all, so a slow save (a bulk document flush can now take a
  // couple of seconds for many staged files) could be double-clicked into
  // two concurrent saveProjectData() calls. Disables Save/Save & Next
  // (and Reset/Cancel, which would otherwise mutate state a save is
  // still reading) for the duration of any save, not just document ones.
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Phase 3.1: General Information now round-trips through the real backend
   * (POST/PATCH /projects) as a gating pre-step, alongside the existing
   * local-only save below — which stays completely unchanged and still owns
   * every other tab's data (Quantity/Payments/Budget/Team/Expenses/
   * Invoices). A brand-new project's client-generated id is replaced with
   * the backend's real id the moment it's created, so every subsequent
   * Save & Next/Save on this same form (any tab) already targets the right
   * row. If the backend rejects the General Information (e.g. a duplicate
   * PR Number), the save stops here — never silently "succeeding" locally
   * while the server has no record of it.
   */
  const saveProjectData = async (): Promise<boolean> => {
    // P0 fix — EditProject data-loss protection. If Quantity/Milestones/
    // Expenses failed to load this session, their local state cannot be
    // trusted as "the complete desired set" — syncQuantityItemsWithApi() (and
    // its Milestones/Expenses equivalents) diff a FRESH server read against
    // whatever is in this state, so an untrustworthy/empty state here would
    // make every real server row look like something the user deleted. Block
    // the entire Save before General Information (or anything else) even
    // starts — never let it partially execute and discover the problem
    // later. Only ever set when mode === "edit" (see SubresourceLoadStatus's
    // own comment) — "add" mode's caller never passes this prop, so this
    // check is always a no-op there.
    if (resourceLoadFailed && (resourceLoadFailed.quantity || resourceLoadFailed.milestones || resourceLoadFailed.expenses)) {
      showToast({
        type: "error",
        message: "Some project data could not be loaded. Please reload the project before saving.",
      });
      return false;
    }

    const timestamp = new Date().toISOString();
    const existing = getProjectById(project.id);
    let projectToSave = project;

    try {
      if (!existing) {
        const created = await createProjectGeneralInfo(project);
        projectToSave = { ...project, id: created.id };
        setProject(projectToSave);

        // Add Project document staging — flush any files picked before
        // this Project existed, using the SAME upload API/authorization/
        // storage Edit Project already uses (see ProjectForm.tsx's
        // flushPendingDocuments()). A partial/total failure here must
        // never be treated as this save failing outright: the Project is
        // already real and legitimate (createProjectGeneralInfo() already
        // succeeded) and must never be rolled back or deleted over a
        // document upload problem. It only blocks ADVANCING past General,
        // so the user can retry the failed file(s) — register the new
        // Project in the local mirror right now (the same addProject()
        // call the bottom of this function would otherwise make once)
        // so the Documents card correctly treats it as unlocked instead of
        // reverting to "locked" on the next render.
        if (onFlushPendingDocuments) {
          const allUploaded = await onFlushPendingDocuments(created.id);
          if (!allUploaded) {
            addProject({ ...projectToSave, createdAt: projectToSave.createdAt || timestamp, updatedAt: timestamp });
            showToast({
              type: "error",
              message: "Some documents failed to upload. Please retry them before continuing.",
            });
            return false;
          }
        }
      } else {
        await updateProjectGeneralInfo(existing.id, project);

        // Same flush, for the case where the user ignored a failed
        // upload's Retry button and simply clicked Save & Next again —
        // never lets the wizard advance while a staged file is still
        // unresolved, regardless of how many times this runs.
        if (onFlushPendingDocuments) {
          const allUploaded = await onFlushPendingDocuments(existing.id);
          if (!allUploaded) {
            showToast({
              type: "error",
              message: "Some documents failed to upload. Please retry them before continuing.",
            });
            return false;
          }
        }
      }
    } catch (err) {
      showToast({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to save General Information. Please try again.",
      });
      return false;
    }

    // Phase 3.3: Quantity now round-trips through the real backend
    // (POST/PATCH/DELETE /projects/:projectId/quantity, /quantity/:id) the
    // same way General Information does above — only once the Quantity tab
    // itself is valid (matches validateQuantityTab, the same rule that
    // already gates leaving that tab). If the user hasn't finished filling
    // it in yet (e.g. still on the General tab of a brand-new project),
    // syncing is skipped for this Save; nothing is lost, since it will sync
    // the next time Save runs with valid Quantity data.
    if (Object.keys(validateQuantityTab(projectToSave)).length === 0) {
      try {
        const syncedQuantityItems = await syncQuantityItemsWithApi(projectToSave.id, projectToSave.quantityItems);
        projectToSave = { ...projectToSave, quantityItems: syncedQuantityItems };
        setProject(projectToSave);
      } catch (err) {
        showToast({
          type: "error",
          message: err instanceof ApiError ? err.message : "Failed to save Quantity Details. Please try again.",
        });
        return false;
      }
    } else if (activeTab === "quantity" || isLastTab) {
      // Bug fix (Aug 2026): this validation gate existed only to decide
      // whether to attempt the sync above — when it failed, the whole save
      // still silently proceeded and reported success, even though Quantity
      // Details were never persisted to the backend. Every OTHER tab's Save
      // & Next click still skips silently here exactly as before (e.g. the
      // very first click on the General tab of a brand-new project, before
      // Quantity has ever been visited — createEmptyProject()'s own
      // placeholder row is expected to fail this check at that point, and
      // that is not an error). Only surfaced when the user is actually on
      // the Quantity tab, or is completing the final Save — the two moments
      // where silently discarding this data would be genuinely misleading.
      showToast({
        type: "error",
        message: "Quantity Details are incomplete and were not saved. Please review the Quantity tab before saving.",
      });
      return false;
    }

    // Phase 3.4: Payment Milestones round-trip through the real backend the
    // same way Quantity does above — only once the Payments tab itself is
    // valid (matches validatePaymentMilestonesTab, the same rule that
    // already gates leaving that tab). Every sync from here on is ordinary
    // CRUD (Create/Update/Delete), never the backend's Ingest endpoint —
    // Ingest only ever runs once, from loadMilestonesForProject() when Edit
    // Project first opens, specifically to adopt pre-existing legacy/
    // imported rows without changing their id. A milestone reaching this
    // point either already went through Ingest (its id is already backend-
    // known) or is a genuinely new row added via "Add Payment" this session
    // (safe to Create with a fresh id, since nothing could reference it yet).
    if (Object.keys(validatePaymentMilestonesTab(projectToSave)).length === 0) {
      try {
        const syncedMilestones = await syncMilestonesWithApi(projectToSave.id, projectToSave.paymentMilestones);
        projectToSave = { ...projectToSave, paymentMilestones: syncedMilestones };
        setProject(projectToSave);
      } catch (err) {
        showToast({
          type: "error",
          message: err instanceof ApiError ? err.message : "Failed to save Payment Milestones. Please try again.",
        });
        return false;
      }
    } else if (activeTab === "payments" || isLastTab) {
      // Bug fix (Aug 2026) — same reasoning as the Quantity Details branch
      // above: only surfaced when the user is actually on the Payments tab,
      // or is completing the final Save, never on an earlier tab's click
      // before Payments has been visited.
      showToast({
        type: "error",
        message: "Payment Milestones are incomplete and were not saved. Please review the Payments tab before saving.",
      });
      return false;
    }

    // Phase 3.5: Other Project Expenses round-trip through the real backend
    // the same way Quantity/Payment Milestones do above — only once the
    // Other Project Expenses tab itself is valid (matches
    // validateOtherExpensesTab, the same rule that already gates leaving
    // that tab). This is a completely separate module from Expense Budget
    // (the 5 flat fields on Project) — Budget has no sync step of its own
    // here, since it already round-tripped as part of the General
    // Information save at the top of this function.
    if (Object.keys(validateOtherExpensesTab(projectToSave)).length === 0) {
      try {
        const { items: syncedExpenses, concurrentChangeDetected } = await syncExpensesWithApi(
          projectToSave.id,
          projectToSave.nonManhourExpenses,
          removedExpenseIds ?? [],
          expensesConcurrencyBaseline
        );
        projectToSave = { ...projectToSave, nonManhourExpenses: syncedExpenses };
        setProject(projectToSave);
        onExpensesSynced?.();
        // Concurrency warning (Sept 2026) — informational only, never blocks
        // or alters the save: removedExpenseIds above already guarantees no
        // data loss regardless of what changed concurrently. Shown AFTER the
        // save succeeds so the user reviews the now-current (just re-fetched)
        // expense list, not a stale one.
        if (concurrentChangeDetected) {
          showToast({
            type: "warning",
            message:
              "⚠️ Other Project Expenses were changed by another user while you were editing this project. Please review the latest expenses before saving again.",
          });
        }
      } catch (err) {
        showToast({
          type: "error",
          message: err instanceof ApiError ? err.message : "Failed to save Other Project Expenses. Please try again.",
        });
        return false;
      }
    }

    if (projectToSave.projectStatus === "Completed" && projectToSave.actualCompletionDate) {
      completeProject(projectToSave.id, {
        actualCompletionDate: projectToSave.actualCompletionDate,
        completionRemarks: projectToSave.completionRemarks || "Project completed successfully.",
        completedBy: projectToSave.completedBy || "Administrator",
      });
      updateProject({
        ...projectToSave,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
      });
    } else if (existing) {
      updateProject({
        ...projectToSave,
        createdAt: existing.createdAt,
        updatedAt: timestamp,
      });
    } else {
      addProject({
        ...projectToSave,
        createdAt: projectToSave.createdAt || timestamp,
        updatedAt: timestamp,
      });
    }

    return true;
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (onValidate && !onValidate()) return;
    setIsSaving(true);
    try {
      const saved = await saveProjectData();
      if (!saved) return;
      showToast({
        type: "success",
        message: mode === "add" ? "Project saved successfully." : "Project updated successfully.",
      });
      navigate(repositoryReturnUrl);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndNext = async () => {
    if (isSaving) return;
    if (onValidate && !onValidate()) return;
    setIsSaving(true);
    try {
      const saved = await saveProjectData();
      if (!saved) return;
      onSaveAndNext();
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (isFirstTab) {
      navigate(repositoryReturnUrl);
    } else {
      onBack();
    }
  };

  const handleReset = () => setResetConfirmOpen(true);

  const handleCancel = () => setCancelConfirmOpen(true);

  return (
    <div className="sticky bottom-0 z-40 -mx-4 mt-2 bg-[var(--nu-surface)]/95 backdrop-blur-md border-t border-[var(--nu-border)] py-3 px-4 flex flex-wrap justify-between items-center gap-3 shadow-[var(--nu-shadow-md)] rounded-t-[var(--nu-radius-lg)]">
      {/* Left side actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<ArrowLeft size={14} />}
          onClick={handleBack}
          disabled={isSaving}
        >
          Back
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={14} />}
          onClick={handleReset}
          disabled={isSaving}
          className="text-[var(--nu-warning)] hover:bg-[var(--nu-warning-soft)]"
        >
          Reset
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<X size={14} />}
          onClick={handleCancel}
          disabled={isSaving}
          className="text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)]"
        >
          Cancel
        </Button>
      </div>

      {/* Right side actions */}
      <div className="flex flex-wrap gap-2">
        {!isLastTab && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<ChevronRight size={14} />}
            onClick={handleSaveAndNext}
            disabled={isSaving}
            className="flex-row-reverse"
          >
            {documentFlushProgress
              ? `Uploading documents (${documentFlushProgress.completed}/${documentFlushProgress.total})...`
              : isSaving
              ? "Saving..."
              : "Save & Next"}
          </Button>
        )}

        {isLastTab && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            disabled={isSaving}
            className="save-project-btn"
          >
            {documentFlushProgress
              ? `Uploading documents (${documentFlushProgress.completed}/${documentFlushProgress.total})...`
              : isSaving
              ? "Saving..."
              : mode === "add"
              ? "Save Project"
              : "Update Project"}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset Form?"
        message="This will clear every unsaved field on this form back to empty. This cannot be undone."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => {
          setResetConfirmOpen(false);
          setProject(createEmptyProject());
          onResetPendingDocuments?.();
        }}
      />

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel?"
        message="Any unsaved changes on this form will be lost."
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={() => {
          setCancelConfirmOpen(false);
          navigate(repositoryReturnUrl);
        }}
      />
    </div>
  );
};

export default FormButtons;
