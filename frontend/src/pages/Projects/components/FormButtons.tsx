import { Save, RotateCcw, X, ArrowLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { syncExpensesWithApi } from "../../../services/otherProjectExpenseService";
import { ApiError } from "../../../services/apiClient";
import { validateQuantityTab, validatePaymentMilestonesTab, validateOtherExpensesTab } from "../../../utils/projectValidation";

import { createEmptyProject } from "../../../utils/createEmptyProject";

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
}

const FormButtons = ({
  project,
  setProject,
  mode,
  activeTab: _activeTab,
  isLastTab,
  isFirstTab,
  onSaveAndNext,
  onBack,
  onValidate,
}: Props) => {
  const navigate = useNavigate();
  const { showToast } = usePmoToast();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

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
    const timestamp = new Date().toISOString();
    const existing = getProjectById(project.id);
    let projectToSave = project;

    try {
      if (!existing) {
        const created = await createProjectGeneralInfo(project);
        projectToSave = { ...project, id: created.id };
        setProject(projectToSave);
      } else {
        await updateProjectGeneralInfo(existing.id, project);
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
        const syncedExpenses = await syncExpensesWithApi(projectToSave.id, projectToSave.nonManhourExpenses);
        projectToSave = { ...projectToSave, nonManhourExpenses: syncedExpenses };
        setProject(projectToSave);
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
    if (onValidate && !onValidate()) return;
    const saved = await saveProjectData();
    if (!saved) return;
    showToast({
      type: "success",
      message: mode === "add" ? "Project saved successfully." : "Project updated successfully.",
    });
    navigate("/projects");
  };

  const handleSaveAndNext = async () => {
    if (onValidate && !onValidate()) return;
    const saved = await saveProjectData();
    if (!saved) return;
    onSaveAndNext();
  };

  const handleBack = () => {
    if (isFirstTab) {
      navigate("/projects");
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
        >
          Back
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={14} />}
          onClick={handleReset}
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
            className="flex-row-reverse"
          >
            Save & Next
          </Button>
        )}

        {isLastTab && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            className="save-project-btn"
          >
            {mode === "add" ? "Save Project" : "Update Project"}
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
          navigate("/projects");
        }}
      />
    </div>
  );
};

export default FormButtons;
