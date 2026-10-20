import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Eye, History, Loader2, Mail, Play, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { Card, CardHeader } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { usePmoToast } from "../../../../components/ui/usePmoToast";
import { ApiError } from "../../../../services/apiClient";
import {
  loadSharedUserOptions,
  recipientError,
  RUN_STATUS_LABELS,
  runStatusTone,
  SKIP_REASON_LABELS,
  type WeeklyEmailSettings,
  type WeeklyEmailUserOption,
} from "../../../../services/weeklyEmailService";
import {
  describeSchedule,
  formatWhen,
  runTypeLabel,
  WEEKLY_EMAIL_NOTIFICATIONS,
  weeklyEmailPreviewPath,
  weeklyEmailRunsPath,
  type WeeklyEmailNotification,
} from "./weeklyEmailNotifications";

interface CcDraft {
  email: string;
  portalUserId: string | null;
  userName: string | null;
}

const inputClass =
  "h-9 w-full px-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)]";
const labelClass = "block text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] mb-1";
/** A router link that looks like the outline <Button size="sm">. */
const linkButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--nu-radius-md)] font-medium whitespace-nowrap text-[12px] px-2.5 py-1.5 transition-all duration-150 bg-transparent text-[var(--nu-accent)] border border-[var(--nu-accent)] hover:bg-[var(--nu-accent-soft)] shadow-xs";

/** Schedule, last run and warnings — the card's one-line run summary (the full history is on its own page). */
export function WeeklyEmailCardStatus({ config, settings }: { config: WeeklyEmailNotification; settings: WeeklyEmailSettings }) {
  const last = settings.lastRun;
  return (
    <div className="px-4 py-2.5 border-b border-[var(--nu-border)] text-[12px] text-[var(--nu-text-secondary)] flex flex-wrap gap-x-6 gap-y-1">
      <p>
        <strong className="text-[var(--nu-text)]">Schedule:</strong> {describeSchedule(settings.schedule.cron, settings.schedule.timezone)}
      </p>
      <p data-field={`${config.id}-last-run`}>
        <strong className="text-[var(--nu-text)]">Last run:</strong>{" "}
        {last ? (
          <>
            {formatWhen(last.startedAt)} · {runTypeLabel(last)} ·{" "}
            <Badge tone={runStatusTone(last.status)}>{RUN_STATUS_LABELS[last.status] ?? last.status}</Badge>
          </>
        ) : (
          "No runs yet"
        )}
      </p>
      {!settings.emailEnabled && (
        <p className="w-full text-[var(--nu-warning)]">
          Email delivery is turned off on this server ({config.flagName}). The weekly check still runs and is recorded, but no email is sent.
        </p>
      )}
      {last?.retryable && (
        <p className="w-full text-[var(--nu-warning)]">This week's scheduled run did not send. Open View All Runs to retry it.</p>
      )}
    </div>
  );
}

/** Preview Report / View All Runs links, and Run now when the server allows manual runs. */
export function WeeklyEmailCardLinks({ config, settings, running, onRunNow }: { config: WeeklyEmailNotification; settings: WeeklyEmailSettings; running: boolean; onRunNow: () => void }) {
  return (
    <>
      <Link to={weeklyEmailPreviewPath(config.slug)} className={linkButtonClass} data-link="preview">
        <Eye size={13} />
        Preview Report
      </Link>
      <Link to={weeklyEmailRunsPath(config.slug)} className={linkButtonClass} data-link="runs">
        <History size={13} />
        View All Runs{settings.totalRuns > 0 ? ` (${settings.totalRuns.toLocaleString("en-IN")})` : ""}
      </Link>
      {settings.manualTriggerEnabled && (
        <Button variant="secondary" size="sm" icon={running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} onClick={onRunNow} disabled={running}>
          Run now
        </Button>
      )}
    </>
  );
}

/** Test seam: render with already-loaded data (no requests). */
export interface WeeklyEmailCardInitial {
  settings: WeeklyEmailSettings;
  users: WeeklyEmailUserOption[];
}

/**
 * Settings → Weekly Emails (Oct 2026): one compact card per weekly
 * notification — status, schedule, To/CC recipients, and links to its
 * Preview Report and View All Runs pages (both server-paginated; nothing of
 * the report or the run history is loaded here). Administrator / PMO Manager
 * only (Settings.tsx + backend).
 */
export function WeeklyEmailCard({ config, initial }: { config: WeeklyEmailNotification; initial?: WeeklyEmailCardInitial }) {
  const { showToast } = usePmoToast();
  const { api } = config;
  const [settings, setSettings] = useState<WeeklyEmailSettings | null>(initial?.settings ?? null);
  const [users, setUsers] = useState<WeeklyEmailUserOption[]>(initial?.users ?? []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toEmail, setToEmail] = useState(initial?.settings.recipients.toEmail ?? "");
  const [cc, setCc] = useState<CcDraft[]>(() => (initial?.settings.recipients.cc ?? []).map((c) => ({ email: c.email, portalUserId: c.portalUserId, userName: c.userName })));
  const [pickUserId, setPickUserId] = useState("");
  const [typedEmail, setTypedEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const applySettings = (s: WeeklyEmailSettings) => {
    setSettings(s);
    setToEmail(s.recipients.toEmail);
    setCc(s.recipients.cc.map((c) => ({ email: c.email, portalUserId: c.portalUserId, userName: c.userName })));
  };

  // Test seam: with already-loaded data the first load is skipped; "Try again" still reloads.
  const hasInitial = initial !== undefined;
  useEffect(() => {
    if (hasInitial && reloadTick === 0) return;
    let isMounted = true;
    // Settings per notification; the user picker list is shared by both cards (one request).
    Promise.all([api.getSettings(), loadSharedUserOptions()])
      .then(([s, u]) => {
        if (!isMounted) return;
        applySettings(s);
        setUsers(u);
      })
      .catch((err) => {
        if (isMounted) setLoadError(err instanceof ApiError ? err.message : "Failed to load Weekly Email settings.");
      });
    return () => {
      isMounted = false;
    };
  }, [api, reloadTick, hasInitial]);

  const savedSnapshot = useMemo(
    () => (settings ? JSON.stringify([settings.recipients.toEmail, settings.recipients.cc.map((c) => c.email)]) : ""),
    [settings]
  );
  const dirty = settings !== null && (JSON.stringify([toEmail, cc.map((c) => c.email)]) !== savedSnapshot || settings.recipients.isDefault);
  const validation = recipientError(toEmail, cc.map((c) => c.email));
  const takenEmails = useMemo(() => new Set([toEmail.trim().toLowerCase(), ...cc.map((c) => c.email.toLowerCase())]), [toEmail, cc]);
  const pickable = users.filter((u) => !takenEmails.has(u.email.toLowerCase()));

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
      const recipients = await api.saveRecipients(toEmail.trim(), cc.map((c) => ({ email: c.email, portalUserId: c.portalUserId })));
      if (settings) applySettings({ ...settings, recipients });
      showToast({ type: "success", message: "Weekly email recipients saved." });
    } catch (err) {
      showToast({ type: "error", message: err instanceof ApiError ? err.message : "Failed to save recipients." });
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    setConfirmRun(false);
    setRunning(true);
    try {
      const r = await api.run("manual");
      const message =
        r.outcome === "skipped"
          ? `Nothing sent — ${SKIP_REASON_LABELS[r.reason] ?? r.reason}.`
          : r.outcome === "sent"
            ? `Email sent — ${r.missingCount} of ${r.eligibleCount} ${config.itemNoun} listed.`
            : r.outcome === "no_missing"
              ? `Nothing to report (${r.eligibleCount} ${config.itemNoun} checked) — no email sent.`
              : r.outcome === "disabled"
                ? `Checked ${r.eligibleCount} ${config.itemNoun}, ${r.missingCount} to report — email delivery is disabled on this server, nothing was sent.`
                : `Email delivery failed: ${r.error ?? "unknown error"}`;
      showToast({ type: r.outcome === "failed" ? "error" : "success", message });
      const fresh = await api.getSettings();
      // Keep unsaved recipient edits; refresh only the run summary.
      setSettings((prev) => (prev ? { ...prev, lastRun: fresh.lastRun, totalRuns: fresh.totalRuns } : fresh));
    } catch (err) {
      showToast({ type: "error", message: err instanceof ApiError ? err.message : "The run could not be started." });
    } finally {
      setRunning(false);
    }
  };

  if (!settings && !loadError) {
    return (
      <Card padded={false} elevated>
        <div className="flex items-center justify-center py-10 gap-2 text-[var(--nu-text-muted)]" data-state={`${config.id}-loading`}>
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[12px] font-medium">Loading {config.title}…</span>
        </div>
      </Card>
    );
  }
  if (loadError || !settings) {
    return (
      <Card padded={false} elevated>
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4" data-state={`${config.id}-error`}>
          <AlertTriangle size={20} className="text-[var(--nu-danger)]" />
          <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">Couldn't load {config.title}</p>
          <p className="text-[11.5px] text-[var(--nu-text-muted)] max-w-sm">{loadError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLoadError(null);
              setReloadTick((t) => t + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="nu-fade-in" data-section={config.id}>
      <Card padded={false} elevated>
        <CardHeader
          icon={<Mail size={15} />}
          title={config.title}
          subtitle={config.subtitle}
          action={
            <Badge tone={settings.emailEnabled ? "success" : "warning"} dot>
              {settings.emailEnabled ? "Email delivery on" : "Email delivery off"}
            </Badge>
          }
        />

        <WeeklyEmailCardStatus config={config} settings={settings} />

        <div className="p-4 space-y-3.5">
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

          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div>
              <label className={labelClass} htmlFor={`${config.id}-to`}>
                To
              </label>
              <input id={`${config.id}-to`} type="email" className={inputClass} value={toEmail} onChange={(e) => setToEmail(e.target.value)} />
            </div>

            <div className="min-w-0">
              <span className={labelClass}>CC ({cc.length})</span>
              {cc.length === 0 ? (
                <p className="text-[12px] text-[var(--nu-text-muted)] py-2">No CC recipients.</p>
              ) : (
                <ul className="divide-y divide-[var(--nu-border)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] max-h-56 overflow-auto nu-scrollbar" data-list={`${config.id}-cc`}>
                  {cc.map((c, i) => (
                    <li key={`${c.email}-${i}`} className="flex items-center gap-3 px-3 py-1.5">
                      <div className="flex-1 min-w-0">
                        {c.portalUserId ? (
                          <p className="text-[12.5px] text-[var(--nu-text)] truncate">
                            <span className="font-semibold">{c.userName ?? c.email}</span>
                            <span className="text-[11px] text-[var(--nu-text-muted)]"> · {c.email}</span>
                          </p>
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
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor={`${config.id}-pick`}>
                Add a PMO Portal user
              </label>
              <div className="flex gap-2">
                <select id={`${config.id}-pick`} className={inputClass} value={pickUserId} onChange={(e) => setPickUserId(e.target.value)}>
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
              <label className={labelClass} htmlFor={`${config.id}-typed`}>
                Or add an email address
              </label>
              <div className="flex gap-2">
                <input
                  id={`${config.id}-typed`}
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
            <WeeklyEmailCardLinks config={config} settings={settings} running={running} onRunNow={() => setConfirmRun(true)} />
          </div>
          {settings.recipients.updatedAt && (
            <p className="text-[11px] text-[var(--nu-text-muted)]">
              Last saved {formatWhen(settings.recipients.updatedAt)}
              {settings.recipients.updatedBy ? ` by ${settings.recipients.updatedBy}` : ""}.
            </p>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={confirmRun}
        title="Run the weekly check now?"
        message={
          !settings.emailEnabled
            ? "Email delivery is off on this server, so the check is recorded but no email is sent."
            : `If any ${config.matchPhrase}, one email is sent now to the saved recipients.`
        }
        confirmLabel="Run now"
        icon={<Play size={18} />}
        onConfirm={handleRun}
        onCancel={() => setConfirmRun(false)}
      />
    </div>
  );
}

/** Settings → Weekly Emails: one card per weekly notification. */
export const WeeklyEmailsSection = () => (
  <div className="space-y-5">
    {WEEKLY_EMAIL_NOTIFICATIONS.map((n) => (
      <WeeklyEmailCard key={n.slug} config={n} />
    ))}
  </div>
);
