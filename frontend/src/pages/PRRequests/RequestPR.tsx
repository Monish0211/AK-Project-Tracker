import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Project } from "../../types/Project";
import { createEmptyProject } from "../../utils/createEmptyProject";
import { getPRRequestDetail } from "../../services/prRequestService";
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
const RequestPR = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = usePmoToast();

  const [project, setProject] = useState<Project>(createEmptyProject());
  const [mode, setMode] = useState<Mode>("draft");
  const [reviewStage, setReviewStage] = useState<"accounts" | "pmo" | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(Boolean(id));

  useEffect(() => {
    if (!id) return;

    getPRRequestDetail(id)
      .then((detail) => {
        if (detail.status === "Draft") {
          setMode("draft");
        } else if (detail.status === "Pending Accounts Approval" && detail.assignedAccountsApproverId === user?.id) {
          setMode("review");
          setReviewStage("accounts");
        } else if (detail.status === "Pending PMO Manager Approval" && detail.assignedPmoManagerId === user?.id) {
          setMode("review");
          setReviewStage("pmo");
        } else {
          showToast({ type: "error", message: "You do not have access to edit this PR Request." });
          navigate("/pr-requests");
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
  }, [id, user?.id]);

  if (isLoading) {
    return <div className="py-12 text-center text-[var(--nu-text-muted)]">Loading...</div>;
  }

  return <RequestPRForm project={project} setProject={setProject} draftId={id ?? null} mode={mode} reviewStage={reviewStage} />;
};

export default RequestPR;
