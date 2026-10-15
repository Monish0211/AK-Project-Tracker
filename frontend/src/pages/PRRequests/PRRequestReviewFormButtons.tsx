import { CheckCircle2, Save, XCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import type { Project } from "../../types/Project";
import { Button } from "../../components/ui/Button";
import { usePmoToast } from "../../components/ui/usePmoToast";
import { ApiError } from "../../services/apiClient";
import {
  accountsApprovePRRequest,
  pmoManagerApprovePRRequest,
  rejectPRRequest,
  updatePRRequestProjectData,
} from "../../services/prRequestService";
import { projectToDraftPayload } from "./draftMapping";
import { validateGeneralTab } from "../../utils/projectValidation";

/**
 * The footer for an Accounts/PMO Manager REVIEWING a pending PR Request —
 * deliberately distinct from RequestPRFormButtons.tsx's Draft-only footer.
 * Save/Approve/Reject are always visible regardless of which tab is active
 * (this is a review of already-complete data, not a step-by-step fill-in
 * wizard — the reviewer should be free to jump between tabs and act at any
 * point).
 *
 * Approve and Reject BOTH persist whatever is currently on screen first,
 * automatically, before performing the action — a real bug found in manual
 * testing: Save and Approve used to be two fully independent actions, so
 * editing a field and going straight to Approve (the natural thing to do)
 * silently discarded the edit, since it only ever existed in this
 * component's local state until an explicit Save. Save itself stays
 * available too, for a reviewer who wants to persist a correction without
 * deciding anything yet.
 */

interface Props {
  project: Project;
  prRequestId: string;
  stage: "accounts" | "pmo";
}

const PRRequestReviewFormButtons = ({ project, prRequestId, stage }: Props) => {
  const navigate = useNavigate();
  const { showToast } = usePmoToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const persistCurrentEdits = () => updatePRRequestProjectData(prRequestId, { projectData: projectToDraftPayload(project) });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await persistCurrentEdits();
      showToast({ type: "success", message: "Changes saved." });
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Failed to save changes. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    setIsActioning(true);
    try {
      // Save first, unconditionally — see this component's own comment
      // above for why. If the save itself fails, stop here: never approve
      // against data that might not match what's on screen.
      await persistCurrentEdits();

      if (stage === "accounts") {
        await accountsApprovePRRequest(prRequestId);
        showToast({ type: "success", message: "Approved — now awaiting PMO Manager approval." });
      } else {
        await pmoManagerApprovePRRequest(prRequestId);
        showToast({ type: "success", message: "Approved — Project created." });
      }
      navigate("/pr-requests?tab=queue");
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Approval failed. Please try again." });
    } finally {
      setIsActioning(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setIsActioning(true);
    try {
      // Same reasoning as handleApprove — persist any on-screen correction
      // before rejecting, so it's part of the historical record even for a
      // request that's about to be finalized as Rejected. Unlike Approve, an
      // incomplete General section (e.g. a request saved before RFQ No.
      // existed) must not block a rejection: those edits are skipped instead
      // of saved, so invalid data is never stored and nothing is created.
      const canPersist = Object.keys(validateGeneralTab(project)).length === 0;
      if (canPersist) await persistCurrentEdits();
      await rejectPRRequest(prRequestId, rejectReason.trim());
      showToast({
        type: "success",
        message: canPersist
          ? "PR Request rejected."
          : "PR Request rejected. On-screen changes were not saved because the General section is incomplete.",
      });
      navigate("/pr-requests?tab=queue");
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Reject failed. Please try again." });
    } finally {
      setIsActioning(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-40 -mx-4 mt-2 bg-[var(--nu-surface)]/95 backdrop-blur-md border-t border-[var(--nu-border)] py-3 px-4 flex flex-wrap justify-between items-center gap-3 shadow-[var(--nu-shadow-md)] rounded-t-[var(--nu-radius-lg)]">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" icon={<ArrowLeft size={14} />} onClick={() => navigate("/pr-requests?tab=queue")}>
          Back to Queue
        </Button>
      </div>

      {showRejectForm ? (
        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            className="h-9 min-w-[240px] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30"
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowRejectForm(false)} disabled={isActioning}>
            Cancel
          </Button>
          <Button type="button" variant="danger" size="sm" disabled={!rejectReason.trim() || isActioning} onClick={handleReject}>
            Confirm Rejection
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" icon={<Save size={14} />} onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="danger" size="sm" icon={<XCircle size={14} />} disabled={isActioning} onClick={() => setShowRejectForm(true)}>
            Reject
          </Button>
          <Button type="button" variant="primary" size="sm" icon={<CheckCircle2 size={14} />} disabled={isActioning} onClick={handleApprove}>
            {stage === "accounts" ? "Approve" : "Approve — Create Project"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PRRequestReviewFormButtons;
