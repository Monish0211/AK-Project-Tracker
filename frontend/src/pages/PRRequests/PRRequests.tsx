import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Eye, Inbox, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { usePmoToast } from "../../components/ui/usePmoToast";
import { ApiError } from "../../services/apiClient";
import { useAuth } from "../../auth/authContext";
import { canReviewPRRequests, canSubmitPRRequest } from "../../auth/permissions";
import { deleteDraftPRRequest, getApprovalsQueue, getMyPRRequests, getUsersByRole, sendToAccounts } from "../../services/prRequestService";
import type { PRRequest, PRRequestStatus, UserByRole } from "../../types/PRRequest";

type Tab = "mine" | "queue";

const STATUS_TONE: Record<PRRequestStatus, "neutral" | "warning" | "accent" | "success" | "danger"> = {
  Draft: "neutral",
  "Pending Accounts Approval": "warning",
  "Pending PMO Manager Approval": "accent",
  Approved: "success",
  Rejected: "danger",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const PRRequests = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = usePmoToast();
  const { user } = useAuth();
  // "PR Request" = submitting (New PR Request, own Draft actions); "Approvals" = reviewing (the Approvals Queue tab).
  // A user can hold either or both; neither implies the other.
  const canSubmit = canSubmitPRRequest(user);
  const canReview = canReviewPRRequests(user);

  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(tabParam === "queue" && canReview ? "queue" : "mine");
  const [rows, setRows] = useState<PRRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PRRequest | null>(null);
  const [sendTarget, setSendTarget] = useState<PRRequest | null>(null);
  const [pmoManagers, setPmoManagers] = useState<UserByRole[]>([]);
  const [allUsers, setAllUsers] = useState<UserByRole[]>([]);
  const [selectedAccountsApproverId, setSelectedAccountsApproverId] = useState("");
  const [selectedPmoManagerId, setSelectedPmoManagerId] = useState("");

  const load = (which: Tab) => {
    setIsLoading(true);
    const call = which === "mine" ? getMyPRRequests() : getApprovalsQueue();
    call
      .then(setRows)
      .catch(() => showToast({ type: "error", message: "Could not load PR Requests." }))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleTabChange = (next: Tab) => {
    if (next === "queue" && !canReview) return;
    setTab(next);
    setSearchParams(next === "queue" ? { tab: "queue" } : {});
  };

  const handleDeleteDraft = async () => {
    if (!deleteTarget) return;
    setActioningId(deleteTarget.id);
    try {
      await deleteDraftPRRequest(deleteTarget.id);
      showToast({ type: "success", message: "Draft deleted." });
      setDeleteTarget(null);
      load(tab);
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Delete failed. Please try again." });
    } finally {
      setActioningId(null);
    }
  };

  const openSendToAccounts = (row: PRRequest) => {
    setSendTarget(row);
    setSelectedAccountsApproverId("");
    setSelectedPmoManagerId("");
    if (pmoManagers.length === 0) {
      getUsersByRole("PMO Manager")
        .then(setPmoManagers)
        .catch(() => showToast({ type: "error", message: "Could not load the list of PMO Managers." }));
    }
    if (allUsers.length === 0) {
      getUsersByRole()
        .then(setAllUsers)
        .catch(() => showToast({ type: "error", message: "Could not load the list of users." }));
    }
  };

  const handleSendToAccounts = async () => {
    if (!sendTarget || !selectedAccountsApproverId || !selectedPmoManagerId) return;
    setActioningId(sendTarget.id);
    try {
      await sendToAccounts(sendTarget.id, selectedAccountsApproverId, selectedPmoManagerId);
      showToast({ type: "success", message: "PR Request sent to Accounts for approval." });
      setSendTarget(null);
      load(tab);
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Could not send this request. Please try again." });
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="space-y-4 nu-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center">
            <ClipboardList size={17} />
          </div>
          <div>
            <h1 className="text-[16px] font-bold text-[var(--nu-text)]">PR Requests</h1>
            <p className="text-[12px] text-[var(--nu-text-muted)]">Track your submissions and act on requests awaiting your approval.</p>
          </div>
        </div>
        {canSubmit && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate("/pr-requests/new")}>
            New PR Request
          </Button>
        )}
      </div>

      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-1.5 shadow-[var(--nu-shadow-sm)] flex items-center gap-1.5 w-fit">
        <button
          type="button"
          onClick={() => handleTabChange("mine")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] text-[12.5px] font-semibold transition-all cursor-pointer ${
            tab === "mine" ? "bg-[var(--nu-accent)] text-white" : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)]"
          }`}
        >
          <ClipboardList size={14} /> My Requests
        </button>
        {canReview && (
          <button
            type="button"
            onClick={() => handleTabChange("queue")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] text-[12.5px] font-semibold transition-all cursor-pointer ${
              tab === "queue" ? "bg-[var(--nu-accent)] text-white" : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)]"
            }`}
          >
            <Inbox size={14} /> Approvals Queue
          </button>
        )}
      </div>

      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] text-left">
              <th className="px-4 py-2.5 font-semibold">PR Number</th>
              <th className="px-4 py-2.5 font-semibold">Project Title</th>
              <th className="px-4 py-2.5 font-semibold">{tab === "mine" ? "Assigned PMO Manager" : "Requested By"}</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Submitted</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--nu-text-muted)]">Loading...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--nu-text-muted)]">
                  {tab === "mine" ? "You haven't created any PR Requests yet." : "Nothing is waiting on your approval right now."}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isDraft = row.status === "Draft";
                // Queue rows always open the editable review form (Save/
                // Approve/Reject live inside it — see RequestPRForm.tsx's
                // "review" mode). My Requests rows open the review form only
                // while still a Draft (the requester's own pre-submission
                // edit); once submitted, the requester's own view is
                // read-only (PRRequestDetail.tsx) — only the assigned
                // approver may edit a submitted request.
                const detailPath = tab === "queue" || isDraft ? `/pr-requests/${row.id}/edit` : `/pr-requests/${row.id}`;
                return (
                  <tr key={row.id} className="border-t border-[var(--nu-border)] hover:bg-[var(--nu-surface-alt)]">
                    <td className="px-4 py-2.5 font-mono cursor-pointer" onClick={() => navigate(detailPath)}>
                      {row.projectData.prNo || "—"}
                    </td>
                    <td className="px-4 py-2.5 cursor-pointer" onClick={() => navigate(detailPath)}>
                      {row.projectData.projectTitle || "Untitled Draft"}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">
                      {tab === "mine" ? (row.assignedPmoManagerName ?? "—") : row.requestedByName}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        {tab === "mine" && isDraft && canSubmit && (
                          <>
                            <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => navigate(`/pr-requests/${row.id}/edit`)}>
                              Edit
                            </Button>
                            <Button variant="primary" size="sm" icon={<Send size={13} />} onClick={() => openSendToAccounts(row)}>
                              Send to Accounts
                            </Button>
                            <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => setDeleteTarget(row)}>
                              Delete
                            </Button>
                          </>
                        )}
                        {tab === "queue" && (
                          <Button variant="primary" size="sm" icon={<Eye size={13} />} onClick={() => navigate(`/pr-requests/${row.id}/edit`)}>
                            Review
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-2xl p-5 space-y-3.5">
            <h3 className="text-[14px] font-bold text-[var(--nu-text)]">
              Delete Draft {deleteTarget.projectData.prNo || "(untitled)"}?
            </h3>
            <p className="text-[12px] text-[var(--nu-text-muted)]">This cannot be undone.</p>
            <div className="flex justify-end gap-2.5 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" disabled={actioningId === deleteTarget.id} onClick={handleDeleteDraft}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {sendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-2xl p-5 space-y-3.5">
            <h3 className="text-[14px] font-bold text-[var(--nu-text)]">
              Send {sendTarget.projectData.prNo || "this PR Request"} to Accounts
            </h3>
            <p className="text-[12px] text-[var(--nu-text-muted)]">
              Select who will approve this on the Accounts side, and the PMO Manager who approves after them. Once
              sent, the Draft can no longer be edited.
            </p>
            <div>
              <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">Assigned Accounts Approver *</label>
              <select
                className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30"
                value={selectedAccountsApproverId}
                onChange={(e) => setSelectedAccountsApproverId(e.target.value)}
              >
                <option value="">Select a user</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">Assigned PMO Manager *</label>
              <select
                className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30"
                value={selectedPmoManagerId}
                onChange={(e) => setSelectedPmoManagerId(e.target.value)}
              >
                <option value="">Select a PMO Manager</option>
                {pmoManagers.map((m) => (
                  <option key={m.id} value={m.id}>{m.fullName}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2.5 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setSendTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Send size={13} />}
                disabled={!selectedAccountsApproverId || !selectedPmoManagerId || actioningId === sendTarget.id}
                onClick={handleSendToAccounts}
              >
                Send to Accounts
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PRRequests;
