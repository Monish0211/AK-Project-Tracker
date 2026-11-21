import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, History, ShieldAlert } from "lucide-react";
import {
  adminControlsService,
  type AdminControlRight,
  type AdminControlsOverview,
} from "../../../../services/adminControlsService";
import { resetAdminRightsCache, useAdminRights } from "../../../../hooks/useAdminRights";
import { PR_APPROVAL_ADMINISTRATION } from "../../../../services/adminControlsService";

/**
 * Settings > Administrative Controls (Administrators only). The ONLY place the two administrative rights are granted or revoked:
 *  - PR Approval Administration: every PR Request in every country; edit, approve or reject at the current stage, reassign, delete.
 *  - Invoice Administration: raise without the automatic email; delete a Raised invoice (archived first, number kept). Paid is never deletable.
 * Rules (enforced on the server, mirrored here only to explain them): Administrators only, never on yourself, a reason for every change,
 * every grant / revoke / refused attempt is audited.
 */

const EVENT_LABELS: Record<string, string> = {
  ADMIN_CONTROL_RIGHT_GRANTED: "Right granted",
  ADMIN_CONTROL_RIGHT_REVOKED: "Right revoked",
  ADMIN_CONTROL_RIGHT_CHANGE_DENIED: "Change refused",
  APPROVAL_RIGHTS_CHANGED: "Approval rights changed (User Management)",
  APPROVAL_RIGHTS_CHANGE_DENIED: "Approval rights change refused",
  INVOICE_RAISED_WITHOUT_EMAIL: "Invoice raised without email",
  INVOICE_ADMIN_DELETED: "Raised invoice deleted (archived)",
  PR_REQUEST_ADMIN_EDITED: "PR Request edited by administrator",
  PR_REQUEST_ADMIN_APPROVED: "PR Request approved by administrator",
  PR_REQUEST_ADMIN_REJECTED: "PR Request rejected by administrator",
  PR_REQUEST_ADMIN_REASSIGNED: "PR Request approver reassigned",
  PR_REQUEST_ADMIN_DELETED: "PR Request deleted by administrator",
};

function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return "The request failed.";
}

/** One readable line from an audit entry's details (never shows raw ids when a name or number is available). */
function describe(details: Record<string, unknown> | null): string {
  if (!details) return "";
  const parts: string[] = [];
  const pick = (k: string, label?: string) => {
    const v = details[k];
    if (v !== undefined && v !== null && v !== "") parts.push(label ? `${label}: ${String(v)}` : String(v));
  };
  pick("right");
  pick("targetName", "user");
  pick("targetEmail", "user");
  pick("prNo", "PR");
  pick("invoiceNo", "invoice");
  pick("stage", "stage");
  pick("refusal", "refused");
  pick("reason", "reason");
  return parts.join(" · ");
}

interface Pending {
  userId: string;
  name: string;
  right: AdminControlRight;
  granted: boolean;
}

export function AdministrativeControlsSection() {
  const [data, setData] = useState<AdminControlsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { holds } = useAdminRights();

  const load = useCallback(() => {
    adminControlsService
      .getOverview()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = async () => {
    if (!pending || reason.trim().length < 5) return;
    setBusy(true);
    setMessage(null);
    try {
      await adminControlsService.setRight(pending.userId, { right: pending.right, granted: pending.granted, reason: reason.trim() });
      setMessage(`${pending.right} ${pending.granted ? "granted to" : "revoked from"} ${pending.name}.`);
      setPending(null);
      setReason("");
      resetAdminRightsCache();
      load();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-5 text-[12.5px] text-red-600" role="alert">
        {error}
      </div>
    );
  }
  if (!data) return <p className="text-[12px] text-[var(--nu-text-secondary)] p-4">Loading Administrative Controls…</p>;

  return (
    <div className="space-y-3.5" data-testid="administrative-controls">
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)]">
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={18} className="text-[var(--nu-accent)] mt-0.5 shrink-0" />
          <div className="text-[12px] text-[var(--nu-text-secondary)] space-y-1">
            <p className="text-[13.5px] font-bold text-[var(--nu-text)]">Administrative Controls</p>
            <p>
              Two rights for exceptional cases. Only active Administrators can hold them, you cannot change your own, and every change needs a reason. Every grant,
              revoke and refused attempt is recorded below and in Security &amp; Audit Logs.
            </p>
            {data.owners.length > 0 && (
              <p data-testid="admin-controls-owner">
                Owner: <span className="font-semibold text-[var(--nu-text)]">{data.owners.map((o) => o.fullName ?? o.email).join(" or ")}</span>
                {data.canManage
                  ? " (you). You hold both rights automatically and are the only one who can grant them to another Administrator (for example to cover leave)."
                  : ". The owner holds both rights and is the only one who can grant or revoke them. You can see who holds what, but cannot change it."}
              </p>
            )}
            {holds(PR_APPROVAL_ADMINISTRATION) && (
              <button
                type="button"
                onClick={() => navigate("/admin/pr-requests")}
                className="mt-1 h-8 px-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] text-[12px] font-semibold text-[var(--nu-accent)] hover:bg-[var(--nu-surface-alt)] cursor-pointer"
              >
                Open the PR Request administration register
              </button>
            )}
          </div>
        </div>
      </div>

      {data.rights.map((right) => (
        <div key={right.name} className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)]" data-right={right.name}>
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-[var(--nu-accent)]" />
            <h3 className="text-[13px] font-bold text-[var(--nu-text)]">{right.name}</h3>
          </div>
          {right.description && <p className="text-[11.5px] text-[var(--nu-text-secondary)] mt-1">{right.description}</p>}
          <div className="mt-2.5 divide-y divide-[var(--nu-border)]">
            {data.administrators.map((admin) => {
              const holds = admin.rights.includes(right.name);
              const isPending = pending?.userId === admin.id && pending.right === right.name;
              return (
                <div key={admin.id} className="py-2 flex flex-wrap items-center gap-2.5">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">
                      {admin.fullName} {admin.isSelf && <span className="text-[10.5px] font-normal text-[var(--nu-text-muted)]">(you)</span>}
                    </p>
                    <p className="text-[11px] text-[var(--nu-text-muted)]">{admin.email}</p>
                  </div>
                  <span className={`text-[11px] font-semibold ${holds ? "text-[var(--nu-success)]" : "text-[var(--nu-text-muted)]"}`}>
                    {admin.isOwner ? "Holds this right (owner)" : holds ? "Holds this right" : "Not granted"}
                  </span>
                  {!data.canManage || admin.isOwner ? null : admin.isSelf ? (
                    <span className="text-[11px] text-[var(--nu-text-muted)]" title="Another Administrator must change your rights.">
                      You cannot change your own rights
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="h-8 px-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] text-[12px] font-semibold text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] disabled:opacity-50 cursor-pointer"
                      disabled={busy}
                      onClick={() => {
                        setPending({ userId: admin.id, name: admin.fullName, right: right.name, granted: !holds });
                        setReason("");
                        setMessage(null);
                      }}
                    >
                      {holds ? "Revoke" : "Grant"}
                    </button>
                  )}
                  {isPending && (
                    <div className="w-full flex flex-wrap items-center gap-2 mt-1.5" data-testid="right-change-reason">
                      <input
                        type="text"
                        autoFocus
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={`Reason to ${pending.granted ? "grant" : "revoke"} ${pending.right} ${pending.granted ? "to" : "from"} ${pending.name} (required, at least 5 characters)`}
                        aria-label={`Reason to ${pending.granted ? "grant" : "revoke"} ${pending.right}`}
                        className="h-9 flex-1 min-w-[260px] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30"
                      />
                      <button type="button" className="h-9 px-3 text-[12px] text-[var(--nu-text-secondary)] cursor-pointer" onClick={() => setPending(null)} disabled={busy}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="h-9 px-3.5 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent)] text-white text-[12px] font-semibold disabled:opacity-50 cursor-pointer"
                        disabled={busy || reason.trim().length < 5}
                        onClick={confirm}
                      >
                        {busy ? "Saving…" : pending.granted ? "Confirm grant" : "Confirm revoke"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {data.administrators.length === 0 && <p className="py-2 text-[12px] text-[var(--nu-text-muted)]">No active Administrators.</p>}
          </div>
        </div>
      ))}

      {message && (
        <p className="text-[12px] text-[var(--nu-text)] px-1" role="status">
          {message}
        </p>
      )}

      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)]">
        <div className="flex items-center gap-2 mb-2">
          <History size={15} className="text-[var(--nu-accent)]" />
          <h3 className="text-[13px] font-bold text-[var(--nu-text)]">Recent administrative activity</h3>
          <span className="text-[11px] text-[var(--nu-text-muted)]">(latest 100)</span>
        </div>
        {data.audit.length === 0 ? (
          <p className="text-[12px] text-[var(--nu-text-muted)]">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-[11.5px] max-h-[360px] overflow-y-auto nu-scrollbar" data-testid="admin-controls-audit">
            {data.audit.map((a) => (
              <li key={a.id} className="text-[var(--nu-text)]">
                <span className="font-semibold">{new Date(a.createdAt).toLocaleString()}</span> · {a.actorEmail} · {EVENT_LABELS[a.event] ?? a.event}
                {describe(a.details) && <span className="text-[var(--nu-text-secondary)]"> · {describe(a.details)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
