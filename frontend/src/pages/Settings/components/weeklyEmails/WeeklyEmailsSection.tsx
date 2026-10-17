import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Loader2, Mail, Play, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { Card, CardHeader } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { usePmoToast } from "../../../../components/ui/usePmoToast";
import { ApiError } from "../../../../services/apiClient";
import {
  getWeeklyEmailSettings,
  getWeeklyEmailUserOptions,
  previewWeeklyEmail,
  recipientError,
  runWeeklyEmailNow,
  RUN_STATUS_LABELS,
  SKIP_REASON_LABELS,
  saveWeeklyEmailRecipients,
  type WeeklyEmailPreview,
  type WeeklyEmailSettings,
  type WeeklyEmailUserOption,
} from "../../../../services/weeklyEmailService";

interface CcDraft {
  email: string;
  portalUserId: string | null;
  userName: string | null;
}

const inputClass =
  "h-9 w-full px-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)]";
const labelClass = "block text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] mb-1";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Every Monday at 09:00 (Asia/Kolkata)" for simple weekly expressions; the raw expression otherwise. */
function describeSchedule(cron: string, timezone: string): string {
  const m = cron.trim().match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-6])$/);
  if (!m) return `Cron "${cron}" (${timezone})`;
  return `Every ${DAYS[Number(m[3])]} at ${m[2]!.padStart(2, "0")}:${m[1]!.padStart(2, "0")} (${timezone})`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Settings → Weekly Emails (Oct 2026). Recipients of the weekly "Projects
 * Missing Other Project Expenses" report: one To address plus CC recipients
 * picked from PMO Portal users (their stored email is used) or typed in.
 * Administrator / PMO Manager only (Settings.tsx + backend).
 */
export const WeeklyEmailsSection = () => {
  const { showToast } = usePmoToast();
  const [settings, setSettings] = useState<WeeklyEmailSettings | null>(null);
  const [users, setUsers] = useState<WeeklyEmailUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toEmail, setToEmail] = useState("");
  const [cc, setCc] = useState<CcDraft[]>([]);
  const [pickUserId, setPickUserId] = useState("");
  const [typedEmail, setTypedEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<WeeklyEmailPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmRun, setConfirmRun] = useState<"manual" | "retry-weekly" | null>(null);
  const [running, setRunning] = useState(false);

  const applySettings = (s: WeeklyEmailSettings) => {
    setSettings(s);
    setToEmail(s.recipients.toEmail);
    setCc(s.recipients.cc.map((c) => ({ email: c.email, portalUserId: c.portalUserId, userName: c.userName })));
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([getWeeklyEmailSettings(), getWeeklyEmailUserOptions()])
      .then(([s, u]) => {
        if (!isMounted) return;
        applySettings(s);
        setUsers(u);
      })
      .catch((err) => {
        if (isMounted) setLoadError(err instanceof ApiError ? err.message : "Failed to load Weekly Email settings.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const savedSnapshot = useMemo(
    () => (settings ? JSON.stringify([settings.recipients.toEmail, settings.recipients.cc.map((c) => c.email)]) : ""),
    [settings]
  );
  const dirty = settings !== null && (JSON.stringify([toEmail, cc.map((c) => c.email)]) !== savedSnapshot || settings.recipients.isDefault);
  const validation = recipientError(toEmail, cc.map((c) => c.email));
  const takenEmails = useMemo(() => new Set([toEmail.trim().toLowerCase(), ...cc.map((c) => c.email.toLowerCase())]), [toEmail, cc]);
  const pickable = users.filter((u) => !takenEmails.has(u.email.toLowerCase()));
  // The latest weekly (scheduled) run, offered for a safe retry when it failed or was interrupted before sending.
  const latestWeekly = settings?.recentRuns.find((r) => r.trigger === "scheduled");
  const retryableWeekly = latestWeekly !== undefined && (latestWeekly.status === "FAILED" || latestWeekly.status === "INTERRUPTED");

  const addPickedUser = () => {
    const u = users.find((x) => x.id === pickUserId);
    if (!u) return;
    setCc((prev) => [...prev, { email: u.email, portalUserId: u.id, userName: u.fullName }]);
    setPickUserId("");
  };

  const addTypedEmail = () => {
    const email = typedEmail.trim();
    const err = recipientError(toEmail || "placeholder@example.com", [...cc.map((c) => c.email), email]);
    if (err) {
      showToast({ type: "error", message: err });
      return;
    }
    // A typed address that belongs to a PMO Portal user is linked to that user.
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    setCc((prev) => [...prev, { email: u?.email ?? email, portalUserId: u?.id ?? null, userName: u?.fullName ?? null }]);
    setTypedEmail("");
  };

  const handleSave = async () => {
    if (validation) {
      showToast({ type: "error", message: validation });
      return;
    }
    setSaving(true);
    try {
      const recipients = await saveWeeklyEmailRecipients(toEmail.trim(), cc.map((c) => ({ email: c.email, portalUserId: c.portalUserId })));
      if (settings) applySettings({ ...settings, recipients });
      showToast({ type: "success", message: "Weekly email recipients saved." });
    } catch (err) {
      showToast({ type: "error", message: err instanceof ApiError ? err.message : "Failed to save recipients." });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await previewWeeklyEmail());
    } catch (err) {
      showToast({ type: "error", message: err instanceof ApiError ? err.message : "Failed to build the preview." });
    } finally {
      setPreviewing(false);
    }
  };

  const handleRun = async () => {
    const mode = confirmRun ?? "manual";
    setConfirmRun(null);
    setRunning(true);
    try {
      const r = await runWeeklyEmailNow(mode);
      const message =
        r.outcome === "skipped"
          ? `Nothing sent — ${SKIP_REASON_LABELS[r.reason] ?? r.reason}.`
          : r.outcome === "sent"
            ? `Email sent — ${r.missingCount} of ${r.eligibleCount} eligible project(s) listed.`
            : r.outcome === "no_missing"
              ? `No eligible project is missing Other Project Expenses (${r.eligibleCount} checked) — no email sent.`
              : r.outcome === "disabled"
                ? `Checked ${r.eligibleCount} project(s), ${r.missingCount} missing — email delivery is disabled on this server, nothing was sent.`
                : `Email delivery failed: ${r.error ?? "unknown error"}`;
      showToast({ type: r.outcome === "failed" ? "error" : "success", message });
      applySettings(await getWeeklyEmailSettings());
    } catch (err) {
      showToast({ type: "error", message: err instanceof ApiError ? err.message : "The run could not be started." });
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <Card padded={false} elevated>
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--nu-text-muted)]">
          <Loader2 size={22} className="animate-spin" />
          <span className="text-[12px] font-medium">Loading Weekly Email settings...</span>
        </div>
      </Card>
    );
  }
  if (loadError || !settings) {
    return (
      <Card padded={false} elevated>
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
          <AlertTriangle size={22} className="text-[var(--nu-danger)]" />
          <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">Couldn't load Weekly Email settings</p>
          <p className="text-[11.5px] text-[var(--nu-text-muted)] max-w-sm">{loadError}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 nu-fade-in" data-section="weekly-emails">
      <Card padded={false} elevated>
        <CardHeader
          icon={<Mail size={15} />}
          title="Projects Missing Other Project Expenses"
          subtitle="Weekly email to the Accounts team listing projects (except On Hold, Completed and Cancelled) with no Other Project Expenses records. Sent only when at least one project is missing."
          action={
            <div className="flex items-center gap-2">
              <Badge tone={settings.emailEnabled ? "success" : "warning"} dot>
                {settings.emailEnabled ? "Email delivery on" : "Email delivery off"}
              </Badge>
            </div>
          }
        />

        <div className="px-4 py-3 border-b border-[var(--nu-border)] text-[12px] text-[var(--nu-text-secondary)] space-y-1">
          <p>
            <strong className="text-[var(--nu-text)]">Schedule:</strong> {describeSchedule(settings.schedule.cron, settings.schedule.timezone)}
          </p>
          {!settings.emailEnabled && (
            <p className="text-[var(--nu-warning)]">
              Email delivery is turned off on this server (MISSING_EXPENSE_EMAIL_ENABLED). The weekly check still runs and is recorded below, but no email is sent.
            </p>
          )}
        </div>

        <div className="p-4 space-y-4">
          {settings.recipients.isDefault && (
            <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 py-2 text-[11.5px] text-[var(--nu-text-secondary)]">
              Showing the default recipients — not saved yet. Save to keep them or change them.
              {settings.recipients.unresolvedDefaults.length > 0 && (
                <span className="block mt-1 text-[var(--nu-warning)]">
                  No PMO Portal user was found for: {settings.recipients.unresolvedDefaults.join(", ")}. Add their email below if they should receive this report.
                </span>
              )}
            </div>
          )}

          <div className="max-w-md">
            <label className={labelClass} htmlFor="weekly-email-to">
              To
            </label>
            <input id="weekly-email-to" type="email" className={inputClass} value={toEmail} onChange={(e) => setToEmail(e.target.value)} />
          </div>

          <div>
            <span className={labelClass}>CC ({cc.length})</span>
            {cc.length === 0 ? (
              <p className="text-[12px] text-[var(--nu-text-muted)]">No CC recipients.</p>
            ) : (
              <ul className="divide-y divide-[var(--nu-border)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] max-w-2xl" data-list="weekly-email-cc">
                {cc.map((c, i) => (
                  <li key={`${c.email}-${i}`} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      {c.portalUserId ? (
                        <>
                          <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate">{c.userName ?? c.email}</p>
                          <p className="text-[11px] text-[var(--nu-text-muted)] truncate">{c.email} · PMO Portal user</p>
                        </>
                      ) : (
                        <input
                          aria-label={`CC email ${i + 1}`}
                          className={inputClass}
                          value={c.email}
                          onChange={(e) => setCc((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                        />
                      )}
                    </div>
                    <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setCc((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove ${c.email}`}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 max-w-3xl">
            <div>
              <label className={labelClass} htmlFor="weekly-email-pick">
                Add a PMO Portal user
              </label>
              <div className="flex gap-2">
                <select id="weekly-email-pick" className={inputClass} value={pickUserId} onChange={(e) => setPickUserId(e.target.value)}>
                  <option value="">Select a user…</option>
                  {pickable.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} — {u.email}
                      {u.role ? ` (${u.role})` : ""}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={addPickedUser} disabled={!pickUserId}>
                  Add
                </Button>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="weekly-email-typed">
                Or add an email address
              </label>
              <div className="flex gap-2">
                <input
                  id="weekly-email-typed"
                  type="email"
                  className={inputClass}
                  placeholder="name@ifluids.com"
                  value={typedEmail}
                  onChange={(e) => setTypedEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTypedEmail();
                    }
                  }}
                />
                <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={addTypedEmail} disabled={!typedEmail.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          {validation && <p className="text-[11.5px] text-[var(--nu-danger)]">{validation}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="primary" size="sm" icon={saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} onClick={handleSave} disabled={saving || !dirty || validation !== null}>
              Save recipients
            </Button>
            <Button variant="ghost" size="sm" icon={<Undo2 size={13} />} onClick={() => applySettings(settings)} disabled={saving || !dirty}>
              Discard changes
            </Button>
            <span className="flex-1" />
            <Button variant="outline" size="sm" icon={previewing ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} onClick={handlePreview} disabled={previewing}>
              Preview this week's report
            </Button>
            {settings.manualTriggerEnabled && (
              <Button variant="secondary" size="sm" icon={running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} onClick={() => setConfirmRun("manual")} disabled={running}>
                Run now
              </Button>
            )}
            {settings.manualTriggerEnabled && retryableWeekly && (
              <Button variant="outline" size="sm" icon={<Play size={13} />} onClick={() => setConfirmRun("retry-weekly")} disabled={running}>
                Retry this week's run
              </Button>
            )}
          </div>
          {settings.recipients.updatedAt && (
            <p className="text-[11px] text-[var(--nu-text-muted)]">
              Last saved {formatWhen(settings.recipients.updatedAt)}
              {settings.recipients.updatedBy ? ` by ${settings.recipients.updatedBy}` : ""}.
            </p>
          )}
        </div>
      </Card>

      {preview && (
        <Card padded={false} elevated>
          <CardHeader
            icon={<Eye size={15} />}
            title="Preview (not sent)"
            subtitle={`${preview.missingCount} of ${preview.eligibleCount} eligible project(s) have no Other Project Expenses records. ${preview.wouldSend ? `The weekly run would email ${preview.recipients.to}${preview.recipients.cc.length ? ` + ${preview.recipients.cc.length} CC` : ""}.` : preview.missingCount === 0 ? "Nothing would be sent." : "Email delivery is off, so nothing would be sent."}`}
          />
          {preview.projects.length > 0 && (
            <div className="overflow-auto nu-scrollbar max-h-[420px]">
              <table className="w-full border-collapse text-left text-[12px]" data-table="weekly-email-preview">
                <thead className="sticky top-0 bg-[var(--nu-surface-alt)] text-[11px] uppercase text-[var(--nu-text-muted)]">
                  <tr>
                    <th className="px-3 py-2">PR No.</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Project Title</th>
                    <th className="px-3 py-2">Project Manager</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.projects.map((p) => (
                    <tr key={p.id} className="border-t border-[var(--nu-border)]">
                      <td className="px-3 py-2 font-semibold">
                        <a href={p.projectUrl} target="_blank" rel="noreferrer" className="text-[var(--nu-accent)] hover:underline">
                          {p.prNo}
                        </a>
                      </td>
                      <td className="px-3 py-2">{p.client}</td>
                      <td className="px-3 py-2">{p.projectTitle}</td>
                      <td className="px-3 py-2">{p.projectManager || "—"}</td>
                      <td className="px-3 py-2">{p.projectStatus || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card padded={false} elevated>
        <CardHeader icon={<Mail size={15} />} title="Recent runs" subtitle="Last five checks (weekly and manual). A failed weekly run is retried safely; a sent week is never sent again." />
        {settings.recentRuns.length === 0 ? (
          <p className="px-4 py-6 text-[12px] text-[var(--nu-text-muted)]">No runs yet.</p>
        ) : (
          <div className="overflow-auto nu-scrollbar">
            <table className="w-full border-collapse text-left text-[12px]" data-table="weekly-email-runs">
              <thead className="bg-[var(--nu-surface-alt)] text-[11px] uppercase text-[var(--nu-text-muted)]">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Run</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2 text-right">Checked</th>
                  <th className="px-3 py-2 text-right">Missing</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {settings.recentRuns.map((r) => (
                  <tr key={`${r.periodKey}-${r.startedAt}`} className="border-t border-[var(--nu-border)]">
                    <td className="px-3 py-2 whitespace-nowrap">{formatWhen(r.startedAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.trigger === "manual" ? "Manual" : `Weekly ${r.periodKey}`}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.status === "SENT" ? "success" : r.status === "FAILED" || r.status === "DELIVERY_UNKNOWN" || r.status === "INTERRUPTED" ? "danger" : "neutral"}>
                        {RUN_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">{r.eligibleCount ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.missingCount ?? "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-[var(--nu-text-muted)]">
                      {r.error ?? (r.attempts > 1 ? `${r.attempts} attempts` : "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmRun !== null}
        title={confirmRun === "retry-weekly" ? "Retry this week's run?" : "Run the weekly check now?"}
        message={
          !settings.emailEnabled
            ? "Email delivery is off on this server, so the check is recorded but no email is sent."
            : confirmRun === "retry-weekly"
              ? "This week's scheduled run did not send. If any eligible project is missing Other Project Expenses, one email is sent now. A week that was already sent is never sent again."
              : "If any eligible project is missing Other Project Expenses, one email is sent now to the saved recipients."
        }
        confirmLabel={confirmRun === "retry-weekly" ? "Retry now" : "Run now"}
        icon={<Play size={18} />}
        onConfirm={handleRun}
        onCancel={() => setConfirmRun(null)}
      />
    </div>
  );
};
