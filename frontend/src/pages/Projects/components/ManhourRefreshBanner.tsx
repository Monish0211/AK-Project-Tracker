import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useAuth } from "../../../auth/authContext";
import { canManageConversionRates, canMutateData, hasModuleAccess } from "../../../auth/permissions";
import { getOpenRefreshRuns, retryRefreshRun } from "../../../services/manhourCostingService";
import { getOpenCountryApplyRuns, retryCountryApply } from "../../../services/manhourConversionRateService";
import { dispatchPmoDataChanged } from "../../../utils/pmoDataChanged";
import { refreshStatusText } from "../../../utils/manhourCosting";
import type { ManhourRefreshStatus } from "../../../utils/manhourCosting";

interface Props {
  status: ManhourRefreshStatus;
  projectId: string;
  onRetried?: () => void;
}

/**
 * Phase 4 / Option A - shown on a project whose automatic manpower recalculation (after an employee's hourly-rate change) is pending or failed, so its
 * man-hour figures are never presented as current. Anyone can see it; a user who can change employees (the Manpower module) can retry it. Renders nothing
 * while the project is current.
 */
export function ManhourRefreshBanner(props: Props) {
  // The common case (the project is current) renders nothing and touches no hooks.
  if (props.status === "CURRENT") return null;
  return <RefreshBannerContent {...props} />;
}

function RefreshBannerContent({ status, projectId, onRetried }: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Two kinds of recalculation can be pending or failed on a project: one started by an employee-rate change (retry needs the Manpower module, like changing the
  // rate) and one started by applying a country conversion rate (retry needs the Manpower Conversion Rates grant and a manager role). Each retry is offered only to
  // a user the server would let do it; the server decides in the end.
  const canRetryEmployee = hasModuleAccess(user, "Manpower") && canMutateData(user);
  const canRetryCountry = canManageConversionRates(user);
  const canRetry = canRetryEmployee || canRetryCountry;

  const retry = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (canRetryEmployee) {
        const runs = await getOpenRefreshRuns();
        for (const run of runs.filter((r) => r.openProjects.some((p) => p.projectId === projectId))) await retryRefreshRun(run.runId);
      }
      if (canRetryCountry) {
        const countryRuns = await getOpenCountryApplyRuns();
        for (const run of countryRuns.filter((r) => r.openProjects.some((p) => p.projectId === projectId))) await retryCountryApply(run.runId);
      }
      dispatchPmoDataChanged({ entity: "project" });
      onRetried?.();
    } catch (err) {
      setMessage(err instanceof Error && err.message ? err.message : "Could not retry the recalculation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="alert"
      data-testid="manhour-refresh-banner"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <AlertTriangle size={14} className="shrink-0" />
      <span className="flex-1">{refreshStatusText(status)}</span>
      {message && <span className="text-[var(--nu-danger)]">{message}</span>}
      {canRetry && (
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 px-2.5 py-1 font-semibold hover:bg-amber-100 disabled:opacity-50 dark:hover:bg-amber-900/40"
          data-testid="manhour-refresh-retry"
        >
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
          Retry recalculation
        </button>
      )}
    </div>
  );
}

export default ManhourRefreshBanner;
