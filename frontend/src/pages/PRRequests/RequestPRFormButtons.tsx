import { Save, RotateCcw, X, ArrowLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { Project } from "../../types/Project";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { usePmoToast } from "../../components/ui/usePmoToast";
import { ApiError } from "../../services/apiClient";
import { saveDraftPRRequest, updatePRRequestProjectData } from "../../services/prRequestService";
import { createEmptyProject } from "../../utils/createEmptyProject";
import { projectToDraftPayload } from "./draftMapping";

/**
 * The Request PR form's own footer — deliberately NOT Projects'
 * FormButtons.tsx. That component calls real per-tab backend endpoints
 * (POST/PATCH /projects, /quantity, /milestones — all of which require a
 * real projectId that doesn't exist yet here) on every "Save & Next" click.
 * This footer instead only validates and advances tabs locally; the ONE
 * real API call (create or update the Draft) happens on the final "Save
 * Draft" click, sending the whole accumulated object as one JSON payload.
 * No approver is ever notified from here — see PRRequests.tsx's separate
 * "Send to Accounts" action for that.
 */

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  draftId: string | null;
  isLastTab: boolean;
  isFirstTab: boolean;
  onSaveAndNext: () => void;
  onBack: () => void;
  onValidate?: () => boolean;
  /** New request only: uploads documents staged before the draft existed, right after it is created. False if any upload failed. */
  onFlushPendingDocuments?: (prRequestId: string) => Promise<boolean>;
}

const RequestPRFormButtons = ({ project, setProject, draftId, isLastTab, isFirstTab, onSaveAndNext, onBack, onValidate, onFlushPendingDocuments }: Props) => {
  const navigate = useNavigate();
  const { showToast } = usePmoToast();
  const [isSaving, setIsSaving] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const handleSaveDraft = async () => {
    if (onValidate && !onValidate()) return;

    setIsSaving(true);
    try {
      const projectData = projectToDraftPayload(project);
      if (draftId) {
        await updatePRRequestProjectData(draftId, { projectData });
      } else {
        const created = await saveDraftPRRequest({ projectData });
        // Staged documents: the draft now exists, so upload them to it. A
        // failed upload never undoes the saved draft — the user is taken to
        // the draft, where the documents card works directly, to add it again.
        if (onFlushPendingDocuments && !(await onFlushPendingDocuments(created.id))) {
          showToast({
            type: "error",
            message: "Draft saved, but some documents failed to upload. Please add them again on this Draft.",
          });
          navigate(`/pr-requests/${created.id}/edit`);
          return;
        }
      }
      showToast({ type: "success", message: "PR Request saved as Draft." });
      navigate("/pr-requests");
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Failed to save Draft. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndNext = () => {
    if (onValidate && !onValidate()) return;
    onSaveAndNext();
  };

  const handleBack = () => {
    if (isFirstTab) {
      navigate("/pr-requests");
    } else {
      onBack();
    }
  };

  return (
    <div className="sticky bottom-0 z-40 -mx-4 mt-2 bg-[var(--nu-surface)]/95 backdrop-blur-md border-t border-[var(--nu-border)] py-3 px-4 flex flex-wrap justify-between items-center gap-3 shadow-[var(--nu-shadow-md)] rounded-t-[var(--nu-radius-lg)]">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" icon={<ArrowLeft size={14} />} onClick={handleBack}>
          Back
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={14} />}
          onClick={() => setResetConfirmOpen(true)}
          className="text-[var(--nu-warning)] hover:bg-[var(--nu-warning-soft)]"
        >
          Reset
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<X size={14} />}
          onClick={() => setCancelConfirmOpen(true)}
          className="text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)]"
        >
          Cancel
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {!isLastTab && (
          <Button type="button" variant="outline" size="sm" icon={<ChevronRight size={14} />} onClick={handleSaveAndNext} className="flex-row-reverse">
            Save & Next
          </Button>
        )}
        {isLastTab && (
          <Button type="button" variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSaveDraft} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Draft"}
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
          navigate("/pr-requests");
        }}
      />
    </div>
  );
};

export default RequestPRFormButtons;
