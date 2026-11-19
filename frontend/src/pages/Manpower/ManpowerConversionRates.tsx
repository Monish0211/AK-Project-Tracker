import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, History, Lock, RefreshCw, Scale } from "lucide-react";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { formatMoney } from "../../utils/currencyDisplay";
import { RATE_NOT_SET, manhourRateText } from "../../utils/manhourCosting";
import { dispatchPmoDataChanged } from "../../utils/pmoDataChanged";
import {
  applyCountryRate,
  getCountryRateHistory,
  getCountryRates,
  getLegacyReview,
  getOpenCountryApplyRuns,
  previewCountryApply,
  retryCountryApply,
  saveCountryRate,
} from "../../services/manhourConversionRateService";
import type { CountryApplyPreview, CountryRate, CountryRateVersion, LegacyClassification, LegacyReview, OpenCountryApplyRun } from "../../services/manhourConversionRateService";

const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
/** A regional amount (decimal text from the server) in its own currency, through the one shared formatter. */
const regionalMoney = (value: string | null, currency: string) => (value === null ? RATE_NOT_SET : formatMoney(Number(value), currency));

type Panel = { kind: "save" | "review" | "history" | "legacy"; regionId: string } | null;

const CLASS_LABEL: Record<LegacyClassification, { text: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }> = {
  CONSISTENT: { text: "Consistent", tone: "success" },
  LEGACY_PROJECT_RATE: { text: "Older project rate", tone: "warning" },
  OLDER_COUNTRY_VERSION: { text: "Older country version", tone: "info" },
  MISSING_RATE: { text: "Rate not set", tone: "warning" },
  NEEDS_REVIEW: { text: "Needs review", tone: "danger" },
};

/**
 * Manpower > Manpower Conversion Rates. One conversion rate PER COUNTRY ("1 regional currency unit = X INR"), kept centrally instead of on each project. India is fixed
 * at INR / 1 and cannot be edited. Saving a version never changes an existing cost: the new version must be reviewed (which projects, which figures) and applied.
 * Reaching this page needs the explicit "Manpower Conversion Rates" Module Access grant; changing anything also needs the Administrator or PMO Manager role. The API
 * enforces both, so the buttons below are a courtesy, not the protection.
 */
export default function ManpowerConversionRates() {
  const [data, setData] = useState<{ canManage: boolean; countries: CountryRate[] } | null>(null);
  const [runs, setRuns] = useState<OpenCountryApplyRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<CountryApplyPreview | null>(null);
  const [history, setHistory] = useState<CountryRateVersion[] | null>(null);
  const [legacy, setLegacy] = useState<LegacyReview | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, open] = await Promise.all([getCountryRates(), getOpenCountryApplyRuns()]);
      setData(list);
      setRuns(open);
      setError(null);
    } catch (err) {
      setError(messageOf(err, "Could not load the manpower conversion rates."));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [list, open] = await Promise.all([getCountryRates(), getOpenCountryApplyRuns()]);
        if (cancelled) return;
        setData(list);
        setRuns(open);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(messageOf(err, "Could not load the manpower conversion rates."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshEverywhere = () => {
    void load();
    dispatchPmoDataChanged({ entity: "project" });
  };

  const openPanel = async (kind: "save" | "review" | "history" | "legacy", country: CountryRate) => {
    setMessage(null);
    setPreview(null);
    setHistory(null);
    setLegacy(null);
    setPanel({ kind, regionId: country.regionId });
    if (kind === "legacy") {
      try {
        setLegacy(await getLegacyReview(country.regionId));
      } catch (err) {
        setMessage({ tone: "error", text: messageOf(err, "Could not load the legacy records.") });
      }
    }
    if (kind === "review") {
      setBusy(true);
      try {
        setPreview(await previewCountryApply(country.regionId));
      } catch (err) {
        setMessage({ tone: "error", text: messageOf(err, "Could not load the preview.") });
      } finally {
        setBusy(false);
      }
    }
    if (kind === "history") {
      try {
        setHistory(await getCountryRateHistory(country.regionId));
      } catch (err) {
        setMessage({ tone: "error", text: messageOf(err, "Could not load the rate history.") });
      }
    }
  };

  const save = async (country: CountryRate) => {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await saveCountryRate(country.regionId, rateInput.trim(), note);
      setRateInput("");
      setNote("");
      setMessage({ tone: "ok", text: `${country.displayName}: saved as version ${saved.current?.version}. Existing project costs are unchanged until you review and apply it.` });
      await load();
      await openPanel("review", country);
    } catch (err) {
      setMessage({ tone: "error", text: messageOf(err, "Could not save the rate.") });
    } finally {
      setBusy(false);
    }
  };

  const apply = async (country: CountryRate) => {
    if (!preview?.rate) return;
    setBusy(true);
    try {
      const result = await applyCountryRate(country.regionId, preview.rate.version, reason);
      setPreview(null);
      setReason("");
      setPanel(null);
      setMessage(
        result.status === "SUCCEEDED"
          ? { tone: "ok", text: `${country.displayName}: version ${result.rateVersion} applied to ${result.projectCount} project${result.projectCount === 1 ? "" : "s"} and recorded in the audit trail.` }
          : { tone: "error", text: `${country.displayName}: ${result.succeededCount} of ${result.projectCount} projects converted; ${result.failedCount} did not complete and can be retried below.` }
      );
      refreshEverywhere();
    } catch (err) {
      setMessage({ tone: "error", text: messageOf(err, "Could not apply the rate.") });
    } finally {
      setBusy(false);
    }
  };

  const retry = async (run: OpenCountryApplyRun) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await retryCountryApply(run.runId);
      setMessage(
        result.status === "SUCCEEDED"
          ? { tone: "ok", text: `${run.regionName}: version ${result.rateVersion} applied to every affected project.` }
          : { tone: "error", text: `${run.regionName}: still ${result.failedCount} project${result.failedCount === 1 ? "" : "s"} not converted.` }
      );
      refreshEverywhere();
    } catch (err) {
      setMessage({ tone: "error", text: messageOf(err, "Could not retry the application.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="conversion-rates-page">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--nu-text)]">Manpower Conversion Rates</h1>
        <p className="mt-0.5 max-w-3xl text-[12.5px] text-[var(--nu-text-muted)]">
          One rate per country converts the INR man-hour cost into that country&apos;s currency for every project in it: <strong>1 regional currency unit = X INR</strong>. Employee hourly rates stay in INR.
          Saving a new version changes nothing by itself; you review the affected projects and then apply it. India is fixed at INR 1 and never converted.
        </p>
      </div>

      {error && <p className="text-[12.5px] text-[var(--nu-danger)]" role="alert">{error}</p>}
      {message && (
        <p className={`flex items-center gap-1.5 text-[12.5px] ${message.tone === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-[var(--nu-danger)]"}`} role="status" data-testid="conversion-rates-message">
          {message.tone === "ok" && <CheckCircle2 size={14} />}
          {message.text}
        </p>
      )}
      {data && !data.canManage && (
        <p className="flex items-center gap-1.5 text-[12px] text-[var(--nu-text-muted)]" data-testid="conversion-rates-readonly">
          <Lock size={13} /> You can view the rates and their history. Only an Administrator or a PMO Manager can change or apply them.
        </p>
      )}

      {runs.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" role="alert" data-testid="conversion-rates-open-runs">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> An application of a rate did not complete</p>
          <ul className="mt-1.5 space-y-1.5">
            {runs.map((run) => (
              <li key={run.runId} className="flex flex-wrap items-center gap-2">
                <span>
                  {run.regionName}, version {run.targetVersion}: {run.openProjects.length} project{run.openProjects.length === 1 ? "" : "s"} not converted ({run.openProjects.map((p) => p.prNo).join(", ")}).
                  {run.lastError ? ` ${run.lastError}` : ""}
                </span>
                {data?.canManage && (
                  <Button size="sm" onClick={() => retry(run)} disabled={busy} data-testid="conversion-rates-retry">
                    <RefreshCw size={12} className="mr-1" /> Retry
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card padded={false}>
        <CardHeader icon={<Scale size={15} />} title="Countries" subtitle="Rate in force, who set it and when. A country without a rate shows Rate not set on its projects." />
        <CardBody>
          {!data && !error && <p className="text-[12.5px] text-[var(--nu-text-muted)]">Loading…</p>}
          {data && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]" data-testid="conversion-rates-table">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)]">
                    <th className="py-1.5 pr-3">Country</th>
                    <th className="py-1.5 pr-3">Currency</th>
                    <th className="py-1.5 pr-3">Rate</th>
                    <th className="py-1.5 pr-3">Version</th>
                    <th className="py-1.5 pr-3">Last updated</th>
                    <th className="py-1.5 pr-3">Updated by</th>
                    <th className="py-1.5 pr-3">Note</th>
                    <th className="py-1.5 pr-3">Records</th>
                    <th className="py-1.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.countries.map((country) => {
                    const current = country.current;
                    const pending = country.rows.behind + country.rows.missing;
                    const open = panel?.regionId === country.regionId ? panel.kind : null;
                    return (
                      <Fragment key={country.regionId}>
                        <tr className="border-t border-[var(--nu-border)] align-top" data-testid={`country-row-${country.name}`}>
                          <td className="py-2 pr-3 font-semibold text-[var(--nu-text)]">{country.displayName}</td>
                          <td className="py-2 pr-3">{country.currency}</td>
                          <td className="py-2 pr-3 font-mono" data-testid={`country-rate-${country.name}`}>
                            {country.fixed ? <span>INR 1 <Badge tone="neutral">Fixed</Badge></span> : current ? manhourRateText(country.currency, current.inrPerRegionalUnit) : <Badge tone="warning">{RATE_NOT_SET}</Badge>}
                          </td>
                          <td className="py-2 pr-3">{country.fixed ? "—" : current ? `v${current.version}` : "—"}</td>
                          <td className="py-2 pr-3">{current ? fmtDate(current.effectiveFrom) : "—"}</td>
                          <td className="py-2 pr-3">{current ? `${current.createdByName} (${current.createdByRole})` : "—"}</td>
                          <td className="py-2 pr-3 max-w-[200px] truncate" title={current?.note ?? ""}>{current?.note ?? "—"}</td>
                          <td className="py-2 pr-3">
                            {country.fixed ? (
                              <span className="text-[var(--nu-text-muted)]">Not converted</span>
                            ) : (
                              <span className="text-[11.5px]">
                                {country.projects} project{country.projects === 1 ? "" : "s"}
                                {pending > 0 && current ? <Badge tone="warning" className="ml-1.5">{pending} to apply</Badge> : null}
                                {(country.otherCurrencyProjects ?? 0) > 0 ? (
                                  <span
                                    className="block text-[10.5px] text-[var(--nu-text-muted)]"
                                    data-testid={`country-other-currency-${country.name}`}
                                    title={`These projects keep their own currency and are never converted with the ${country.currency} rate.`}
                                  >
                                    +{country.otherCurrencyProjects} in another currency (not converted)
                                  </span>
                                ) : null}
                                {country.openRun ? <Badge tone="danger" className="ml-1.5">Incomplete</Badge> : null}
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {country.fixed ? (
                              <span className="text-[11.5px] text-[var(--nu-text-muted)]">No editing</span>
                            ) : (
                              <div className="flex flex-wrap justify-end gap-1.5">
                                <Button size="sm" onClick={() => openPanel("history", country)} data-testid={`country-history-${country.name}`}>
                                  <History size={12} className="mr-1" /> History
                                </Button>
                                <Button size="sm" onClick={() => openPanel("legacy", country)} data-testid={`country-legacy-${country.name}`}>
                                  Legacy records
                                </Button>
                                {data.canManage && (
                                  <Fragment>
                                    <Button size="sm" variant="primary" onClick={() => openPanel("save", country)} data-testid={`country-save-${country.name}`}>
                                      {current ? "Save new version" : "Set rate"}
                                    </Button>
                                    {current && (
                                      <Button size="sm" onClick={() => openPanel("review", country)} data-testid={`country-review-${country.name}`}>
                                        Review &amp; apply
                                      </Button>
                                    )}
                                  </Fragment>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>

                        {open === "save" && data.canManage && (
                          <tr className="bg-[var(--nu-surface-alt)]" data-testid={`country-form-${country.name}`}>
                            <td colSpan={9} className="px-3 py-3">
                              <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto_auto] sm:items-end">
                                <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                                  1 {country.currency} = INR
                                  <input
                                    inputMode="decimal"
                                    value={rateInput}
                                    onChange={(e) => setRateInput(e.target.value)}
                                    placeholder="e.g. 243.156"
                                    className="mt-1 w-full rounded-lg border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2.5 py-1.5 text-[13px] normal-case text-[var(--nu-text)]"
                                    data-testid="country-rate-input"
                                  />
                                </label>
                                <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                                  Note (optional)
                                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2.5 py-1.5 text-[13px] normal-case text-[var(--nu-text)]" />
                                </label>
                                <Button variant="primary" size="sm" onClick={() => save(country)} disabled={busy || rateInput.trim() === ""} data-testid="country-rate-save">
                                  Save new version
                                </Button>
                                <Button size="sm" onClick={() => setPanel(null)} disabled={busy}>Cancel</Button>
                              </div>
                              <p className="mt-1.5 text-[11.5px] text-[var(--nu-text-muted)]">A new version never changes costs that are already stored. You will review the affected projects next.</p>
                            </td>
                          </tr>
                        )}

                        {open === "history" && (
                          <tr className="bg-[var(--nu-surface-alt)]" data-testid={`country-history-panel-${country.name}`}>
                            <td colSpan={9} className="px-3 py-3">
                              {!history ? (
                                <p className="text-[12px] text-[var(--nu-text-muted)]">Loading…</p>
                              ) : history.length === 0 ? (
                                <p className="text-[12px] text-[var(--nu-text-muted)]">No version has been saved for {country.displayName} yet.</p>
                              ) : (
                                <ul className="space-y-0.5 text-[12px] text-[var(--nu-text-secondary)]">
                                  {history.map((h) => (
                                    <li key={h.version}>
                                      v{h.version}: {manhourRateText(h.regionalCurrency, h.inrPerRegionalUnit)}, {h.createdByName} ({h.createdByRole}), {fmtDate(h.effectiveFrom)}
                                      {h.note ? ` · ${h.note}` : ""}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="mt-2"><Button size="sm" onClick={() => setPanel(null)}>Close</Button></div>
                            </td>
                          </tr>
                        )}

                        {open === "legacy" && (
                          <tr className="bg-[var(--nu-surface-alt)]" data-testid={`country-legacy-panel-${country.name}`}>
                            <td colSpan={9} className="px-3 py-3">
                              {!legacy ? (
                                <p className="text-[12px] text-[var(--nu-text-muted)]">Loading the existing records…</p>
                              ) : (
                                <Fragment>
                                  <p className="text-[12.5px] text-[var(--nu-text)]">
                                    How the existing {country.displayName} records were converted. This is a report only: nothing is changed here, and no rate is chosen or assumed.
                                    {legacy.approved ? ` Approved country rate: ${manhourRateText(legacy.currency, legacy.approved.inrPerRegionalUnit)} (version ${legacy.approved.version}).` : " No country rate has been approved yet."}
                                  </p>
                                  {legacy.conflict && legacy.conflictReason && (
                                    <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-amber-800 dark:text-amber-300" role="alert" data-testid="legacy-conflict">
                                      <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {legacy.conflictReason}
                                    </p>
                                  )}
                                  {legacy.projects.length === 0 ? (
                                    <p className="mt-2 text-[12px] text-[var(--nu-text-muted)]">No project of this country has man-hour records yet.</p>
                                  ) : (
                                    <div className="mt-2 max-h-80 overflow-auto">
                                      <table className="w-full text-left text-[12px]">
                                        <thead>
                                          <tr className="text-[10.5px] uppercase text-[var(--nu-text-muted)]">
                                            <th className="py-1 pr-3">Project</th>
                                            <th className="py-1 pr-3">Status</th>
                                            <th className="py-1 pr-3 text-right">Records</th>
                                            <th className="py-1 pr-3">Previous rate</th>
                                            <th className="py-1 pr-3">Approved rate</th>
                                            <th className="py-1 pr-3 text-right">Now ({legacy.currency})</th>
                                            <th className="py-1 pr-3 text-right">Proposed ({legacy.currency})</th>
                                            <th className="py-1">Reason</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {legacy.projects.map((p) => (
                                            <tr key={p.projectId} className="border-t border-[var(--nu-border)] align-top" data-testid={`legacy-row-${p.prNo}`}>
                                              <td className="py-1 pr-3"><span className="font-mono">{p.prNo}</span> <span className="text-[var(--nu-text-muted)]">{p.projectTitle}</span></td>
                                              <td className="py-1 pr-3"><Badge tone={CLASS_LABEL[p.classification].tone}>{CLASS_LABEL[p.classification].text}</Badge></td>
                                              <td className="py-1 pr-3 text-right font-mono">{p.records.total}</td>
                                              <td className="py-1 pr-3 font-mono">{p.previousRate === null ? "—" : p.previousRate === "mixed" ? "mixed" : `${Number(p.previousRate)}${p.previousVersion !== null ? ` (v${p.previousVersion}${p.previousScope === "PROJECT" ? ", project" : ""})` : ""}`}</td>
                                              <td className="py-1 pr-3 font-mono">{p.approvedRate === null ? "—" : `${Number(p.approvedRate)} (v${p.approvedVersion})`}</td>
                                              <td className="py-1 pr-3 text-right font-mono">{regionalMoney(p.previousRegional, legacy.currency)}</td>
                                              <td className="py-1 pr-3 text-right font-mono font-semibold">{regionalMoney(p.proposedRegional, legacy.currency)}</td>
                                              <td className="py-1 text-[11.5px] text-[var(--nu-text-muted)]">{p.reason}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                  <p className="mt-2 text-[11.5px] text-[var(--nu-text-muted)]">
                                    To move records to the approved rate, use Review &amp; apply (Administrator or PMO Manager). Nothing is applied automatically.
                                  </p>
                                </Fragment>
                              )}
                              <div className="mt-2"><Button size="sm" onClick={() => setPanel(null)}>Close</Button></div>
                            </td>
                          </tr>
                        )}

                        {open === "review" && data.canManage && (
                          <tr className="bg-[var(--nu-surface-alt)]" data-testid={`country-review-panel-${country.name}`}>
                            <td colSpan={9} className="px-3 py-3">
                              {!preview ? (
                                <p className="text-[12px] text-[var(--nu-text-muted)]">{busy ? "Loading the affected projects…" : "No preview available."}</p>
                              ) : preview.totals.rows === 0 ? (
                                <p className="text-[12.5px] text-[var(--nu-text)]">Nothing to apply: every {country.displayName} record is already on version {preview.rate?.version}.</p>
                              ) : (
                                <Fragment>
                                  <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">
                                    Apply version {preview.rate?.version} ({manhourRateText(preview.currency, preview.rate?.inrPerRegionalUnit ?? "")}) to {preview.totals.rows} record{preview.totals.rows === 1 ? "" : "s"} in {preview.totals.projects} project{preview.totals.projects === 1 ? "" : "s"}.
                                    {" "}Total {preview.currency}: {regionalMoney(preview.totals.currentRegional, preview.currency)} → <span data-testid="country-preview-total">{regionalMoney(preview.totals.proposedRegional, preview.currency)}</span>. The INR base cost does not change.
                                  </p>
                                  <div className="mt-2 max-h-72 overflow-auto">
                                    <table className="w-full text-left text-[12px]">
                                      <thead>
                                        <tr className="text-[10.5px] uppercase text-[var(--nu-text-muted)]">
                                          <th className="py-1 pr-3">Project</th>
                                          <th className="py-1 pr-3 text-right">Records</th>
                                          <th className="py-1 pr-3 text-right">INR cost</th>
                                          <th className="py-1 pr-3 text-right">Now ({preview.currency})</th>
                                          <th className="py-1 text-right">After ({preview.currency})</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {preview.projects.map((p) => (
                                          <tr key={p.projectId} className="border-t border-[var(--nu-border)]">
                                            <td className="py-1 pr-3"><span className="font-mono">{p.prNo}</span> <span className="text-[var(--nu-text-muted)]">{p.projectTitle}</span></td>
                                            <td className="py-1 pr-3 text-right font-mono">{p.rowCount}</td>
                                            <td className="py-1 pr-3 text-right font-mono">{formatMoney(p.manhourCostInr, "INR")}</td>
                                            <td className="py-1 pr-3 text-right font-mono">{regionalMoney(p.currentRegional, preview.currency)}</td>
                                            <td className="py-1 text-right font-mono font-semibold">{regionalMoney(p.proposedRegional, preview.currency)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-end gap-2">
                                    <label className="min-w-[200px] flex-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                                      Reason (optional, kept in the audit trail)
                                      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2.5 py-1.5 text-[13px] normal-case text-[var(--nu-text)]" />
                                    </label>
                                    <Button variant="primary" size="sm" onClick={() => apply(country)} disabled={busy} data-testid="country-apply">
                                      Apply to {preview.totals.projects} project{preview.totals.projects === 1 ? "" : "s"}
                                    </Button>
                                    <Button size="sm" onClick={() => setPanel(null)} disabled={busy}>Cancel</Button>
                                  </div>
                                </Fragment>
                              )}
                              {preview && preview.totals.rows === 0 && <div className="mt-2"><Button size="sm" onClick={() => setPanel(null)}>Close</Button></div>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
