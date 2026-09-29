import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { usePmoToast } from "../../components/ui/usePmoToast";
import { useAuth } from "../../auth/authContext";
import { ApiError } from "../../services/apiClient";
import {
  accountsApprovePRRequest,
  getPRRequestDetail,
  pmoManagerApprovePRRequest,
  rejectPRRequest,
} from "../../services/prRequestService";
import type { PRRequestDetail, PRRequestStatus } from "../../types/PRRequest";

const STATUS_TONE: Record<PRRequestStatus, "neutral" | "warning" | "accent" | "success" | "danger"> = {
  Draft: "neutral",
  "Pending Accounts Approval": "warning",
  "Pending PMO Manager Approval": "accent",
  Approved: "success",
  Rejected: "danger",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const FIELD_LABELS: [string, string][] = [
  ["poMonth", "PO Month"],
  ["prCategory", "PR Category"],
  ["client", "Client"],
  ["department", "Department"],
  ["domesticForeign", "Domestic / Foreign"],
  ["workOrderStatus", "Work Order Status"],
  ["projectStartDate", "Project Start Date"],
  ["projectStatus", "Project Status"],
  ["workOrderNumber", "Work Order Number"],
  ["workOrderDate", "Work Order Date"],
  ["eicName", "EIC Name"],
  ["contractType", "Contract Type"],
  ["pmoCoordinator", "PMO Coordinator"],
];

const PRRequestDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = usePmoToast();

  const [request, setRequest] = useState<PRRequestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = () => {
    if (!id) return;
    setIsLoading(true);
    getPRRequestDetail(id)
      .then(setRequest)
      .catch((error) => showToast({ type: "error", message: error instanceof ApiError ? error.message : "Could not load this PR Request." }))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading) {
    return <div className="py-12 text-center text-[var(--nu-text-muted)]">Loading...</div>;
  }
  if (!request) {
    return <div className="py-12 text-center text-[var(--nu-text-muted)]">This PR Request could not be found.</div>;
  }

  // Actionability is a UI convenience only — the backend independently
  // re-verifies identity + current status on every action call, so this
  // never needs to be perfectly authoritative, only close enough to show
  // the right buttons for the common case.
  const canActOnAccountsStage = request.status === "Pending Accounts Approval" && request.assignedAccountsApproverId === user?.id;
  const canActOnPmoStage = request.status === "Pending PMO Manager Approval" && request.assignedPmoManagerId === user?.id;
  const canAct = canActOnAccountsStage || canActOnPmoStage;

  const handleApprove = async () => {
    if (!id) return;
    setIsActioning(true);
    try {
      if (canActOnAccountsStage) {
        await accountsApprovePRRequest(id);
        showToast({ type: "success", message: "Approved — now awaiting PMO Manager approval." });
      } else {
        await pmoManagerApprovePRRequest(id);
        showToast({ type: "success", message: "Approved — Project created." });
      }
      load();
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Approval failed. Please try again." });
    } finally {
      setIsActioning(false);
    }
  };

  const handleReject = async () => {
    if (!id || !rejectReason.trim()) return;
    setIsActioning(true);
    try {
      await rejectPRRequest(id, rejectReason.trim());
      showToast({ type: "success", message: "PR Request rejected." });
      setShowRejectForm(false);
      setRejectReason("");
      load();
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Reject failed. Please try again." });
    } finally {
      setIsActioning(false);
    }
  };

  return (
    <div className="space-y-4 nu-fade-in max-w-3xl">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--nu-text-secondary)] hover:text-[var(--nu-text)] cursor-pointer"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-5 shadow-[var(--nu-shadow-sm)] space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-[16px] font-bold text-[var(--nu-text)]">{request.projectData.projectTitle}</h1>
            <p className="text-[12px] font-mono text-[var(--nu-text-muted)]">{request.projectData.prNo}</p>
          </div>
          <Badge tone={STATUS_TONE[request.status]}>{request.status}</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
          {FIELD_LABELS.map(([key, label]) => (
            <div key={key}>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">{label}</p>
              <p className="font-semibold text-[var(--nu-text)] mt-0.5">
                {String((request.projectData as unknown as Record<string, unknown>)[key] ?? "—")}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--nu-border)] text-[12px]">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Requested By</p>
            <p className="font-semibold text-[var(--nu-text)] mt-0.5">{request.requestedByName}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Assigned Accounts Approver</p>
            <p className="font-semibold text-[var(--nu-text)] mt-0.5">{request.assignedAccountsApproverName ?? "Not yet assigned"}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Assigned PMO Manager</p>
            <p className="font-semibold text-[var(--nu-text)] mt-0.5">{request.assignedPmoManagerName ?? "Not yet assigned"}</p>
          </div>
        </div>

        {request.status === "Rejected" && (
          <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/30 text-[12px]">
            <p className="font-bold text-[var(--nu-danger)]">Rejected by {request.rejectedByName}</p>
            <p className="text-[var(--nu-text-secondary)] mt-1">{request.rejectionReason}</p>
          </div>
        )}

        {request.status === "Approved" && request.createdProjectId && (
          <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-success-soft)] border border-[var(--nu-success)]/30 text-[12px] flex items-center justify-between">
            <span className="font-semibold text-[var(--nu-success)]">Project created successfully.</span>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/edit/${request.createdProjectId}`)}>
              View Project
            </Button>
          </div>
        )}

        {canAct && !showRejectForm && (
          <div className="flex justify-end gap-2.5 pt-2 border-t border-[var(--nu-border)]">
            <Button variant="danger" size="sm" icon={<XCircle size={14} />} disabled={isActioning} onClick={() => setShowRejectForm(true)}>
              Reject
            </Button>
            <Button variant="primary" size="sm" icon={<CheckCircle2 size={14} />} disabled={isActioning} onClick={handleApprove}>
              {canActOnAccountsStage ? "Approve (Accounts)" : "Approve — Create Project"}
            </Button>
          </div>
        )}

        {canAct && showRejectForm && (
          <div className="pt-2 border-t border-[var(--nu-border)] space-y-2.5">
            <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)]">Rejection Reason *</label>
            <textarea
              className="w-full rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 py-2 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 min-h-[80px]"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" size="sm" onClick={() => setShowRejectForm(false)}>Cancel</Button>
              <Button variant="danger" size="sm" disabled={!rejectReason.trim() || isActioning} onClick={handleReject}>
                Confirm Rejection
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-5 shadow-[var(--nu-shadow-sm)]">
        <h2 className="text-[13px] font-bold text-[var(--nu-text)] mb-3">Approval History</h2>
        <div className="space-y-2.5">
          {request.approvalHistory.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between text-[12px] border-b border-[var(--nu-border)] pb-2.5 last:border-0">
              <div>
                <p className="font-semibold text-[var(--nu-text)]">
                  {entry.action} <span className="text-[var(--nu-text-muted)] font-normal">by {entry.actorName}</span>
                </p>
                {entry.remarks && <p className="text-[var(--nu-text-secondary)] mt-0.5">{entry.remarks}</p>}
              </div>
              <span className="text-[var(--nu-text-muted)] whitespace-nowrap ml-3">{formatDateTime(entry.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PRRequestDetailPage;
