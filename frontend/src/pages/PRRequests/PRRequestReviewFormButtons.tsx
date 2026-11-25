import { CheckCircle2, Save, XCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import type { Project } from "../../types/Project";
import { Button } from "../../components/ui/Button";
import { usePmoToast } from "../../components/ui/usePmoToast";
import { ApiError } from "../../services/apiClient";
import {
  accountsApprovePRRequest,
  adminApprovePRRequest,
  adminEditPRRequest,
  adminRejectPRRequest,
  pmoManagerApprovePRRequest,
  rejectPRRequest,
  updatePRRequestProjectData,
} from "../../services/prRequestService";
import { projectToDraftPayload } from "./draftMapping";
import { validateGeneralTab } from "../../utils/projectValidation";
import { missingExchangeRateMessage } from "../../utils/regionalCurrencySync";

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
  /** "draft" only in admin mode: an administrator editing a Draft can only Save. */
  stage: "accounts" | "pmo" | "draft";
  /**
   * Administrative Controls: a PR Approval Administration holder acting on behalf of the assigned approver. Same buttons, but one mandatory
   * reason goes with every save and decision, and the admin endpoints are called (stage by stage, recorded).
   */
  admin?: boolean;
  /** False until the country's currency is known: Save, Approve and Reject wait for it. */
  ready?: boolean;
}

const PRRequestReviewFormButtons = ({ project, prRequestId, stage, admin = false, ready = true }: Props) => {
  const navigate = useNavigate();
  const { showToast } = usePmoToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [adminReason, setAdminReason] = useState("");
  const adminReasonOk = adminReason.trim().length >= 5;
  const backPath = admin ? "/admin/pr-requests" : "/pr-requests?tab=queue";

  const persistCurrentEdits = () =>
    admin
      ? adminEditPRRequest(prRequestId, projectToDraftPayload(project), adminReason.trim())
      : updatePRRequestProjectData(prRequestId, { projectData: projectToDraftPayload(project) });

  const requireAdminReason = (): boolean => {
    if (!admin || adminReasonOk) return true;
    showToast({ type: "error", message: "Enter the reason for this administrative action (at least 5 characters)." });
    return false;
  };

  const requireExchangeRate = (): boolean => {
    const message = missingExchangeRateMessage(project);
    if (message) showToast({ type: "error", message });
    return !message;
  };

  const handleSave = async () => {
    if (!requireAdminReason() || !requireExchangeRate()) return;
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
    if (!requireAdminReason() || !requireExchangeRate()) return;
    setIsActioning(true);
    try {
      // Save first, unconditionally — see this component's own comment
      // above for why. If the save itself fails, stop here: never approve
      // against data that might not match what's on screen.
      await persistCurrentEdits();

      if (admin) {
        await adminApprovePRRequest(prRequestId, adminReason.trim());
        showToast({ type: "success", message: stage === "accounts" ? "Accounts stage approved — now awaiting PMO Manager approval." : "Approved — Project created." });
      } else if (stage === "accounts") {
        await accountsApprovePRRequest(prRequestId);
        showToast({ type: "success", message: "Approved — now awaiting PMO Manager approval." });
      } else {
        await pmoManagerApprovePRRequest(prRequestId);
        showToast({ type: "success", message: "Approved — Project created." });
      }
      navigate(backPath);
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Approval failed. Please try again." });
    } finally {
      setIsActioning(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    if (admin && rejectReason.trim().length < 5) {
      showToast({ type: "error", message: "The rejection reason must be at least 5 characters." });
      return;
    }
    setIsActioning(true);
    try {
      // Same reasoning as handleApprove — persist any on-screen correction
      // before rejecting, so it's part of the historical record even for a
      // request that's about to be finalized as Rejected. Unlike Approve, an
      // incomplete General section (e.g. a request saved before RFQ No.
      // existed) must not block a rejection: those edits are skipped instead
      // of saved, so invalid data is never stored and nothing is created.
      // Admin: on-screen edits are saved only when a separate admin reason was given (the rejection reason is the decision's own reason).
      const canPersist = Object.keys(validateGeneralTab(project)).length === 0 && (!admin || adminReasonOk);
      // A rejection is never blocked by the form: edits the server refuses (an unfinished quantity line, a missing rate) are left unsaved.
      let editsRefused = false;
      if (canPersist) {
        try {
          await persistCurrentEdits();
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 400) throw error;
          editsRefused = true;
        }
      }
      if (admin) await adminRejectPRRequest(prRequestId, rejectReason.trim());
      else await rejectPRRequest(prRequestId, rejectReason.trim());
      showToast({
        type: "success",
        message: !canPersist
          ? "PR Request rejected. On-screen changes were not saved because the General section is incomplete."
          : editsRefused
          ? "PR Request rejected. On-screen changes were not saved because some of them are incomplete."
          : "PR Request rejected.",
      });
      navigate(backPath);
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Reject failed. Please try again." });
    } finally {
      setIsActioning(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-40 -mx-4 mt-2 bg-[var(--nu-surface)]/95 backdrop-blur-md border-t border-[var(--nu-border)] py-3 px-4 flex flex-wrap justify-between items-center gap-3 shadow-[var(--nu-shadow-md)] rounded-t-[var(--nu-radius-lg)]">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" icon={<ArrowLeft size={14} />} onClick={() => navigate(backPath)}>
          {admin ? "Back to Register" : "Back to Queue"}
        </Button>
        {admin && !showRejectForm && (
          <input
            type="text"
            value={adminReason}
            onChange={(e) => setAdminReason(e.target.value)}
            placeholder="Reason for this administrative action (required)"
            aria-label="Administrative reason"
            className="h-9 min-w-[300px] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30"
          />
        )}
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
          <Button type="button" variant="danger" size="sm" disabled={!rejectReason.trim() || isActioning || !ready} onClick={handleReject}>
            Confirm Rejection
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" icon={<Save size={14} />} onClick={handleSave} disabled={isSaving || !ready}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
          {stage !== "draft" && (
            <>
              <Button type="button" variant="danger" size="sm" icon={<XCircle size={14} />} disabled={isActioning || !ready} onClick={() => setShowRejectForm(true)}>
                Reject
              </Button>
              <Button type="button" variant="primary" size="sm" icon={<CheckCircle2 size={14} />} disabled={isActioning || !ready} onClick={handleApprove}>
                {stage === "accounts" ? (admin ? "Approve Accounts stage" : "Approve") : "Approve — Create Project"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PRRequestReviewFormButtons;
