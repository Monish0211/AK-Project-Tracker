import { prCategoryLabel } from "../../../utils/prCategoryLabel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, Pencil, ShieldAlert, Trash2, UserCog } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { usePmoToast } from "../../../components/ui/usePmoToast";
import { ApiError } from "../../../services/apiClient";
import {
  adminDeletePRRequest,
  adminReassignPRRequest,
  getUsersByRole,
  listAllPRRequestsForAdmin,
} from "../../../services/prRequestService";
import type { AdminPRRequest, PRRequestStatus, UserByRole } from "../../../types/PRRequest";
import { PR_CATEGORIES } from "../../../utils/createEmptyProject";

/**
 * Administrative Controls > PR Request register (PR Approval Administration holders only). Every PR Request in every country and status,
 * deleted ones included. Approve / reject / edit happen on the review screen (always at the request's current stage, with a reason);
 * reassign and delete happen here. Every action needs a reason and is recorded in the request's history and the security audit log.
 */

export const STATUS_TONE: Record<PRRequestStatus, "neutral" | "warning" | "accent" | "success" | "danger"> = {
  Draft: "neutral",
  "Pending Accounts Approval": "warning",
  "Pending PMO Manager Approval": "accent",
  Approved: "success",
  Rejected: "danger",
  Deleted: "neutral",
};

const STATUSES: PRRequestStatus[] = ["Draft", "Pending Accounts Approval", "Pending PMO Manager Approval", "Approved", "Rejected", "Deleted"];
const PENDING = new Set<PRRequestStatus>(["Pending Accounts Approval", "Pending PMO Manager Approval"]);
const EDITABLE = new Set<PRRequestStatus>(["Draft", "Pending Accounts Approval", "Pending PMO Manager Approval"]);
const DELETABLE = new Set<PRRequestStatus>(["Draft", "Pending Accounts Approval", "Pending PMO Manager Approval", "Rejected"]);

const selectClass =
  "h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type Dialog = { kind: "delete" | "reassign"; row: AdminPRRequest } | null;

const AdminPRRequests = () => {
  const navigate = useNavigate();
  const { showToast } = usePmoToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const prCategory = searchParams.get("country") ?? "";

  const [rows, setRows] = useState<AdminPRRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pmoManagers, setPmoManagers] = useState<UserByRole[]>([]);
  const [allUsers, setAllUsers] = useState<UserByRole[]>([]);
  const [newAccounts, setNewAccounts] = useState("");
  const [newPmo, setNewPmo] = useState("");

  const load = useCallback(() => {
    setIsLoading(true);
    listAllPRRequestsForAdmin({ status, prCategory })
      .then(setRows)
      .catch((error) => showToast({ type: "error", message: error instanceof ApiError ? error.message : "Could not load PR Requests." }))
      .finally(() => setIsLoading(false));
  }, [status, prCategory, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key: "status" | "country", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  // Free-text search is client-side over the loaded page (PR number, title, client, requester) - no extra request per keystroke.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.prNo, r.projectName, r.customerName, r.requestedByName].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

  const openDialog = (kind: "delete" | "reassign", row: AdminPRRequest) => {
    setDialog({ kind, row });
    setReason("");
    setNewAccounts("");
    setNewPmo("");
    if (kind === "reassign") {
      if (pmoManagers.length === 0) getUsersByRole("PMO Manager").then(setPmoManagers).catch(() => undefined);
      if (allUsers.length === 0) getUsersByRole().then(setAllUsers).catch(() => undefined);
    }
  };

  const confirm = async () => {
    if (!dialog || reason.trim().length < 5) return;
    setBusy(true);
    try {
      if (dialog.kind === "delete") {
        await adminDeletePRRequest(dialog.row.id, reason.trim());
        showToast({ type: "success", message: `PR Request ${dialog.row.prNo || ""} deleted. It stays in this register.` });
      } else {
        await adminReassignPRRequest(dialog.row.id, {
          ...(newAccounts ? { assignedAccountsApproverId: newAccounts } : {}),
          ...(newPmo ? { assignedPmoManagerId: newPmo } : {}),
          reason: reason.trim(),
        });
        showToast({ type: "success", message: "Approver reassigned; the new approver has been notified." });
      }
      setDialog(null);
      load();
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "The action failed. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const reassignReady = dialog?.kind === "reassign" ? Boolean(newAccounts || newPmo) : true;

  return (
    <div className="space-y-4 nu-fade-in" data-testid="admin-pr-register">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center">
          <ShieldAlert size={17} />
        </div>
        <div>
          <h1 className="text-[16px] font-bold text-[var(--nu-text)]">PR Requests — Administration</h1>
          <p className="text-[12px] text-[var(--nu-text-muted)]">
            Every request in every country. Act only at the current stage; every action needs a reason and is recorded.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Status" className={selectClass} value={status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Country" className={selectClass} value={prCategory} onChange={(e) => setFilter("country", e.target.value)}>
          <option value="">All countries</option>
          {PR_CATEGORIES.map((c) => (
            <option key={c} value={c}>{prCategoryLabel(c)}</option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search"
          placeholder="Search PR number, title, client, requester"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${selectClass} min-w-[260px] flex-1`}
        />
        <span className="text-[11.5px] text-[var(--nu-text-muted)]">{visible.length} request(s)</span>
      </div>

      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] text-left">
              <th className="px-4 py-2.5 font-semibold">PR Number</th>
              <th className="px-4 py-2.5 font-semibold">Project Title</th>
              <th className="px-4 py-2.5 font-semibold">Country</th>
              <th className="px-4 py-2.5 font-semibold">Requested By</th>
              <th className="px-4 py-2.5 font-semibold">Current approver</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Submitted</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--nu-text-muted)]">Loading...</td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--nu-text-muted)]">No PR Requests match these filters.</td>
              </tr>
            ) : (
              visible.map((row) => {
                const currentApprover =
                  row.status === "Pending Accounts Approval" ? row.assignedAccountsApproverName : row.status === "Pending PMO Manager Approval" ? row.assignedPmoManagerName : null;
                return (
                  <tr key={row.id} className="border-t border-[var(--nu-border)] hover:bg-[var(--nu-surface-alt)]" data-status={row.status}>
                    <td className="px-4 py-2.5 font-mono">{row.prNo || "—"}</td>
                    <td className="px-4 py-2.5">{row.projectName || "Untitled Draft"}</td>
                    <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{prCategoryLabel(row.prCategory) || "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{row.requestedByName}</td>
                    <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{currentApprover ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="secondary" size="sm" icon={<Eye size={13} />} onClick={() => navigate(`/admin/pr-requests/${row.id}`)}>
                          View
                        </Button>
                        {EDITABLE.has(row.status) && (
                          <Button variant="primary" size="sm" icon={<Pencil size={13} />} onClick={() => navigate(`/admin/pr-requests/${row.id}/review`)}>
                            {PENDING.has(row.status) ? "Review" : "Edit"}
                          </Button>
                        )}
                        {PENDING.has(row.status) && (
                          <Button variant="outline" size="sm" icon={<UserCog size={13} />} onClick={() => openDialog("reassign", row)}>
                            Reassign
                          </Button>
                        )}
                        {DELETABLE.has(row.status) && (
                          <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => openDialog("delete", row)}>
                            Delete
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

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-2xl p-5 space-y-3.5">
            <h3 className="text-[14px] font-bold text-[var(--nu-text)]">
              {dialog.kind === "delete" ? `Delete ${dialog.row.prNo || "this PR Request"}?` : `Reassign approver — ${dialog.row.prNo || "PR Request"}`}
            </h3>
            {dialog.kind === "delete" ? (
              <p className="text-[12px] text-[var(--nu-text-muted)]">
                The request and its history are kept and stay visible here; it disappears from the requester&apos;s and approvers&apos; lists. An approved request can never
                be deleted.
              </p>
            ) : (
              <div className="space-y-2.5">
                {dialog.row.status === "Pending Accounts Approval" && (
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                      Accounts Approver (now {dialog.row.assignedAccountsApproverName ?? "none"})
                    </label>
                    <select className={`${selectClass} w-full`} value={newAccounts} onChange={(e) => setNewAccounts(e.target.value)}>
                      <option value="">Keep current</option>
                      {allUsers
                        .filter((u) => u.id !== dialog.row.assignedAccountsApproverId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>{u.fullName}</option>
                        ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    PMO Manager (now {dialog.row.assignedPmoManagerName ?? "none"})
                  </label>
                  <select className={`${selectClass} w-full`} value={newPmo} onChange={(e) => setNewPmo(e.target.value)}>
                    <option value="">Keep current</option>
                    {pmoManagers
                      .filter((u) => u.id !== dialog.row.assignedPmoManagerId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                  </select>
                </div>
              </div>
            )}
            <div>
              <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">Reason * (at least 5 characters)</label>
              <textarea
                className="w-full rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 py-2 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 min-h-[70px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant={dialog.kind === "delete" ? "danger" : "primary"}
                size="sm"
                disabled={busy || reason.trim().length < 5 || !reassignReady}
                onClick={confirm}
              >
                {busy ? "Saving..." : dialog.kind === "delete" ? "Delete request" : "Reassign"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPRRequests;
