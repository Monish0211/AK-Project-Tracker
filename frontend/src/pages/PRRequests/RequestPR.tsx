import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Project } from "../../types/Project";
import { createEmptyProject } from "../../utils/createEmptyProject";
import { getPRRequestDetail, getPRRequestDetailForAdmin } from "../../services/prRequestService";
import { adminControlsService, PR_APPROVAL_ADMINISTRATION } from "../../services/adminControlsService";
import { usePmoToast } from "../../components/ui/usePmoToast";
import { useAuth } from "../../auth/authContext";
import { ApiError } from "../../services/apiClient";
import RequestPRForm from "./RequestPRForm";
import { draftPayloadToProject } from "./draftMapping";

type Mode = "draft" | "review";

/**
 * Loader/wrapper for RequestPRForm — decides which of three things
 * /pr-requests/:id/edit is for, based on the loaded request's status and
 * the current user's relationship to it: (1) /pr-requests/new — a brand-new
 * empty Draft; (2) the requester editing their own still-Draft request
 * (mode "draft"); (3) the currently assigned Accounts/PMO Manager approver
 * reviewing (and optionally correcting) a request pending at their stage
 * (mode "review"). Anyone else hitting this URL is redirected away — same
 * privacy rule as everywhere else in this module. All persistence lives in
 * RequestPRForm's own footer, which itself picks Draft-footer vs
 * Review-footer based on the `mode` this component passes down.
 */
/** `admin`: Administrative Controls review (PR Approval Administration holders) - any Draft or pending request, at its current stage. */
const RequestPR = ({ admin = false }: { admin?: boolean }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = usePmoToast();

  const [project, setProject] = useState<Project>(createEmptyProject());
  const [mode, setMode] = useState<Mode>("draft");
  const [reviewStage, setReviewStage] = useState<"accounts" | "pmo" | "draft" | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(Boolean(id));
  // Administrative Controls: while deciding where a user without ordinary access goes (administrative review or away), show nothing.
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (!id) return;

    (admin ? getPRRequestDetailForAdmin(id) : getPRRequestDetail(id))
      .then((detail) => {
        if (admin) {
          const stage = detail.status === "Pending Accounts Approval" ? "accounts" : detail.status === "Pending PMO Manager Approval" ? "pmo" : detail.status === "Draft" ? "draft" : null;
          if (!stage) {
            showToast({ type: "error", message: `A request that is ${detail.status} can no longer be edited.` });
            navigate(`/admin/pr-requests/${id}`);
            return;
          }
          setMode("review");
          setReviewStage(stage);
        } else if (detail.status === "Draft") {
          setMode("draft");
        } else if (detail.status === "Pending Accounts Approval" && detail.assignedAccountsApproverId === user?.id) {
          setMode("review");
          setReviewStage("accounts");
        } else if (detail.status === "Pending PMO Manager Approval" && detail.assignedPmoManagerId === user?.id) {
          setMode("review");
          setReviewStage("pmo");
        } else {
          // Administrative Controls: an administrator who holds PR Approval Administration (e.g. a direct link, a refresh, or Review from the
          // normal queue) is taken to the administrative review of the SAME request instead of an access error. Everyone else: unchanged.
          setIsRedirecting(true);
          void adminControlsService
            .getMyRights()
            .then((r) => r.rights.includes(PR_APPROVAL_ADMINISTRATION))
            .catch(() => false)
            .then((isHolder) => {
              if (isHolder) {
                navigate(`/admin/pr-requests/${id}/review`, { replace: true });
                return;
              }
              showToast({ type: "error", message: "You do not have access to edit this PR Request." });
              navigate("/pr-requests");
            });
          return;
        }
        setProject((prev) => draftPayloadToProject(prev, detail.projectData));
      })
      .catch((error) => {
        showToast({ type: "error", message: error instanceof ApiError ? error.message : "Could not load this PR Request." });
        navigate("/pr-requests");
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, admin]);

  if (isLoading || isRedirecting) {
    return <div className="py-12 text-center text-[var(--nu-text-muted)]">Loading...</div>;
  }

  return <RequestPRForm project={project} setProject={setProject} draftId={id ?? null} mode={mode} reviewStage={reviewStage} admin={admin} />;
};

export default RequestPR;
