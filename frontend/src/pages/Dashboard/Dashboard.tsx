import { useEffect, useRef, useState } from "react";
import "./dashboard-theme.css";
import DashboardAtmosphere from "./components/DashboardAtmosphere";
import DashboardToolbar from "./components/DashboardToolbar";
import HeroBar from "./components/HeroBar";
import ProjectsInLossHoursWidget from "./components/ProjectsInLossHoursWidget";
import ProjectsInLossTimeWidget from "./components/ProjectsInLossTimeWidget";
import KPISection from "./components/KPISection";
import TeamLeadsWorkloadWidget from "./components/TeamLeadsWorkloadWidget";
import ProjectTimesheetPendingWidget from "./components/ProjectTimesheetPendingWidget";
import PMOAlertsWidget from "./components/PMOAlertsWidget";
import ProjectHealthSummary from "./components/ProjectHealthSummary";
import ActivityFeed from "./components/ActivityFeed";
import DepartmentSummary from "./components/DepartmentSummary";
import TopClients from "./components/TopClients";
import RecentProjects from "./components/RecentProjects";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { ApiError } from "../../services/apiClient";
import { fetchDashboardSummary, type DashboardSummary } from "../../services/dashboardSummaryService";
import { DashboardSummaryProvider } from "./DashboardSummaryContext";

// Toggle for the dashboard's ambient background (see DashboardAtmosphere.tsx).
// Flip to false to disable instantly without removing any code; delete
// DashboardAtmosphere.tsx + dashboard-atmosphere.css + this flag + the
// <DashboardAtmosphere /> line below to remove the feature entirely.
//
// The earlier Aurora prototype (DashboardAurora.tsx / dashboard-aurora.css)
// is frozen and left on disk, unused, in case of future reference — it is
// no longer rendered here.
const ENABLE_DASHBOARD_BACKGROUND = true;

const Dashboard = () => {
  const { refreshKey, lastUpdated, refresh } = useLiveRefresh();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    if (!hasLoadedRef.current) setIsLoading(true);
    setLoadError(null);

    fetchDashboardSummary()
      .then((data) => {
        if (!isMounted) return;
        hasLoadedRef.current = true;
        setSummary(data);
        setLoadError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        const message =
          err instanceof ApiError
            ? err.message
            : "Unable to load Dashboard data. Please try again.";
        setLoadError(message);
        if (!hasLoadedRef.current) setSummary(null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  const showBlockingLoad = isLoading && !summary;
  const showBlockingError = Boolean(loadError) && !summary;

  return (
    <div className="dashboard-shell">
      {ENABLE_DASHBOARD_BACKGROUND && <DashboardAtmosphere />}

      <div className="relative z-[1]">
        <DashboardToolbar onRefresh={refresh} />

        <div className="p-4 space-y-3.5 nu-fade-in">
          {showBlockingLoad && (
            <div className="bg-[var(--nu-surface)] rounded-[var(--nu-radius-lg)] border border-[var(--nu-border)] shadow-[var(--nu-shadow-md)] p-10 text-center">
              <p className="text-sm font-semibold text-[var(--nu-text)]">Loading Dashboard…</p>
              <p className="text-[12px] text-[var(--nu-text-muted)] mt-1.5">
                Fetching portfolio totals from the server. Figures are not shown until that response arrives.
              </p>
            </div>
          )}

          {showBlockingError && (
            <div className="bg-[var(--nu-surface)] rounded-[var(--nu-radius-lg)] border border-red-200 dark:border-red-900/60 shadow-[var(--nu-shadow-md)] p-10 text-center">
              <p className="text-sm font-bold text-red-600 dark:text-red-400">Unable to load Dashboard</p>
              <p className="text-[12px] text-[var(--nu-text-muted)] mt-1.5 max-w-lg mx-auto">
                {loadError}
              </p>
              <button
                type="button"
                onClick={refresh}
                className="mt-4 text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {summary && (
            <DashboardSummaryProvider value={summary}>
              {loadError && (
                <div className="rounded-[var(--nu-radius-md)] border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 px-3.5 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                  Latest refresh failed ({loadError}). Showing last successful totals from {new Date(summary.generatedAt).toLocaleString("en-IN")} — not zeros from a failed request.
                </div>
              )}
              <HeroBar lastUpdated={lastUpdated} isStale={Boolean(loadError)} />

              {/* KPI Cards — unchanged */}
              <KPISection />

              {/* Executive Risk Section Grid — unchanged */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                <ProjectsInLossHoursWidget />
                <ProjectsInLossTimeWidget />
              </div>

              {/* Team Leads Workload (kept) + Project Timesheet Pending
              (replaces Invoice Collection Due) + PMO Alerts */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
                <TeamLeadsWorkloadWidget />
                <ProjectTimesheetPendingWidget />
                <PMOAlertsWidget />
              </div>

              {/* Timeline & Portfolio Summaries Row — unchanged */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                <ActivityFeed />
                <TopClients />
                <ProjectHealthSummary />
              </div>

              {/* Department Summary — full width */}
              <DepartmentSummary />

              {/* Recent Projects — compact card replacing Quick Actions */}
              <RecentProjects />
            </DashboardSummaryProvider>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
