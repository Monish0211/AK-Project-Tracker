import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe2, History, Bell, Trash2, CheckCircle2 } from "lucide-react";
import {
  countryReminderService,
  type CountryReminder,
  type CountryReminderCountry,
  type CountryReminderSettingView,
  type SettingAuditEntry,
} from "../../../../services/countryReminderService";

/**
 * Settings → Country Reminders. One card per country the signed-in administrator holds (the server returns only those). Each card has that country's project reminder
 * alerts switch, its important reminders and its change history; nothing is shared between countries. Every save is authorized and audited on the server.
 *
 * The two Weekly Emails (projects missing Other Project Expenses, invoices unpaid 30+ days) are NOT here: they are global, all-countries reports configured once under
 * Settings → Weekly Emails.
 */

function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return "The request failed.";
}

const onOff = (v: { enabled: boolean } | null): string => (v ? (v.enabled ? "On" : "Off") : "default");

function SettingRow({ regionId, setting, onSaved }: { regionId: string; setting: CountryReminderSettingView; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      await countryReminderService.updateSetting(regionId, setting.type, { enabled });
      onSaved();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 py-2" data-setting={setting.type}>
      <div className="min-w-[200px] flex-1">
        <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">{setting.label}</p>
        <p className="text-[11px] text-[var(--nu-text-secondary)]">
          Reminders set inside this country&apos;s projects (Project → Reminders).{" "}
          {setting.isDefault ? "Default: on." : `Updated ${setting.updatedAt ? new Date(setting.updatedAt).toLocaleString() : ""}`}
        </p>
      </div>
      <label className="flex items-center gap-1.5 text-[12px] text-[var(--nu-text)]">
        <input type="checkbox" checked={setting.enabled} onChange={(e) => toggle(e.target.checked)} disabled={busy} aria-label={`${setting.label} enabled`} />
        {busy ? "Saving…" : "Enabled"}
      </label>
      {msg && <span className="text-[11px] text-red-600 w-full">{msg}</span>}
    </div>
  );
}

function AuditPanel({ regionId, version }: { regionId: string; version: number }) {
  const [items, setItems] = useState<SettingAuditEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    countryReminderService
      .audit(regionId)
      .then((r) => !cancelled && setItems(r.items))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [regionId, version]);
  if (!items) return <p className="text-[11px] text-[var(--nu-text-secondary)] mt-2">Loading history…</p>;
  if (items.length === 0) return <p className="text-[11px] text-[var(--nu-text-secondary)] mt-2">No changes recorded for this country yet.</p>;
  return (
    <ul className="mt-2 space-y-1 text-[11.5px]" data-testid="country-audit">
      {items.map((a) => (
        <li key={a.id} className="text-[var(--nu-text)]">
          <span className="font-semibold">{new Date(a.changedAt).toLocaleString()}</span> · {a.actorName} · Project reminder alerts: {onOff(a.previousValue)} → {onOff(a.newValue)}
        </li>
      ))}
    </ul>
  );
}

function ImportantReminders({ regionId }: { regionId: string }) {
  const [items, setItems] = useState<CountryReminder[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<CountryReminder["priority"]>("Normal");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    countryReminderService
      .listReminders({ regionId })
      .then((r) => setItems(r.items))
      .catch((e) => setMsg(errorText(e)));
  }, [regionId]);
  useEffect(load, [load]);

  const add = async () => {
    setMsg(null);
    try {
      await countryReminderService.createReminder({ regionId, title: title.trim(), reminderDate: date, reminderTime: time || undefined, priority });
      setTitle("");
      setDate("");
      setTime("");
      load();
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  const act = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
      load();
    } catch (e) {
      setMsg(errorText(e));
    }
  };

  return (
    <div className="mt-2 space-y-2" data-testid="country-important-reminders">
      <div className="flex flex-wrap gap-2 items-center">
        <input className="text-[12px] rounded-md border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2 py-1 flex-1 min-w-[180px]" placeholder="Reminder title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="Reminder title" />
        <input type="date" className="text-[12px] rounded-md border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2 py-1" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Reminder date" />
        <input type="time" className="text-[12px] rounded-md border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2 py-1" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Reminder time" />
        <select className="text-[12px] rounded-md border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2 py-1" value={priority} onChange={(e) => setPriority(e.target.value as CountryReminder["priority"])} aria-label="Priority">
          {(["Low", "Normal", "High", "Critical"] as const).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={!title.trim() || !date} className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-[var(--nu-accent)] text-white disabled:opacity-40">
          Add
        </button>
      </div>
      {msg && <p className="text-[11px] text-red-600">{msg}</p>}
      {items.length === 0 ? (
        <p className="text-[11px] text-[var(--nu-text-secondary)]">No open important reminders for this country.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-[12px]">
              <span className="flex-1 min-w-0 truncate">
                <span className="font-semibold">{r.title}</span> · {r.reminderDate}
                {r.reminderTime ? ` ${r.reminderTime}` : ""} · {r.priority}
              </span>
              <button type="button" title="Mark done" aria-label={`Mark ${r.title} done`} onClick={() => act(() => countryReminderService.updateReminder(r.id, { isCompleted: true }))}>
                <CheckCircle2 size={15} />
              </button>
              <button type="button" title="Delete" aria-label={`Delete ${r.title}`} onClick={() => act(() => countryReminderService.deleteReminder(r.id))}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Panel = "audit" | "important" | null;

function CountryCard({ country, onSaved, version }: { country: CountryReminderCountry; onSaved: () => void; version: number }) {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const tabBtn = (p: Panel, icon: React.ReactNode, label: string) => (
    <button type="button" onClick={() => toggle(p)} className={`flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-md ${panel === p ? "bg-[var(--nu-accent)] text-white" : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)]"}`}>
      {icon}
      {label}
    </button>
  );
  return (
    <section className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-3.5 shadow-[var(--nu-shadow-sm)]" data-country={country.regionId}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Globe2 size={16} className="text-[var(--nu-accent)]" />
        <h3 className="text-[14px] font-bold text-[var(--nu-text)]">{country.name}</h3>
      </div>
      {country.settings.map((s) => (
        <SettingRow key={s.type} regionId={country.regionId} setting={s} onSaved={onSaved} />
      ))}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {tabBtn("important", <Bell size={13} />, "Important reminders")}
        {tabBtn("audit", <History size={13} />, "Change history")}
      </div>
      {panel === "important" && <ImportantReminders regionId={country.regionId} />}
      {panel === "audit" && <AuditPanel regionId={country.regionId} version={version} />}
    </section>
  );
}

export function CountryRemindersSection() {
  const [countries, setCountries] = useState<CountryReminderCountry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(() => {
    countryReminderService
      .listSettings()
      .then((r) => {
        setCountries(r.countries);
        setError(null);
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  const onSaved = useCallback(() => {
    setVersion((v) => v + 1);
    load();
  }, [load]);

  const sorted = useMemo(() => (countries ? [...countries].sort((a, b) => a.name.localeCompare(b.name)) : null), [countries]);

  if (error) return <div className="text-[12.5px] text-red-600 p-3" role="alert">{error}</div>;
  if (!sorted) return <div className="text-[12.5px] text-[var(--nu-text-secondary)] p-3">Loading country reminders…</div>;
  if (sorted.length === 0)
    return (
      <div className="text-[12.5px] text-[var(--nu-text-secondary)] p-3" data-testid="no-countries">
        You do not hold any country, so there are no country reminders to manage. Ask an administrator to grant country access.
      </div>
    );
  return (
    <div className="space-y-3" data-testid="country-reminders-section">
      <p className="text-[12px] text-[var(--nu-text-secondary)]">
        Project reminders follow their project&apos;s country, and each country&apos;s important reminders are shown only to people who hold that country. Only the countries
        you hold are listed; every change is recorded. The weekly emails are global, all-countries reports and are set up under Weekly Emails.
      </p>
      {sorted.map((c) => (
        <CountryCard key={c.regionId} country={c} onSaved={onSaved} version={version} />
      ))}
    </div>
  );
}
