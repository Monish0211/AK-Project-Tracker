import { useState, lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useReportsData } from "../components/reports/useReportsData";
import { ReportGroupContext } from "../components/reports/reportCurrencyContext";
import type { ReportGroupData } from "../components/reports/useReportsData";
import { ReportHeader, type ReportTabKey } from "../components/reports/Shared/ReportHeader";
import { ReportFilters } from "../components/reports/Shared/ReportFilters";
import { InvoiceAccessContext } from "../components/reports/Shared/invoiceAccess";
import { InvoiceDataUnavailable } from "../components/reports/Shared/InvoiceDataUnavailable";
import { CountryReportLens } from "../components/reports/Shared/CountryReportLens";
import { resolveLensView, type CountryLensView } from "../components/reports/countryLens";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

// Lazy-loaded report sub-modules for fast page load & memory optimization
const ExecutiveSummary = lazy(() =>
  import("../components/reports/ExecutiveSummary/ExecutiveSummary").then((m) => ({ default: m.ExecutiveSummary }))
);
const FinancialDashboard = lazy(() =>
  import("../components/reports/Financial/FinancialDashboard").then((m) => ({ default: m.FinancialDashboard }))
);
const ProjectPerformance = lazy(() =>
  import("../components/reports/ProjectPerformance/ProjectPerformance").then((m) => ({ default: m.ProjectPerformance }))
);
const InvoiceAnalytics = lazy(() =>
  import("../components/reports/InvoiceAnalytics/InvoiceAnalytics").then((m) => ({ default: m.InvoiceAnalytics }))
);
const CollectionAnalytics = lazy(() =>
  import("../components/reports/CollectionAnalytics/CollectionAnalytics").then((m) => ({ default: m.CollectionAnalytics }))
);
const ExpenseAnalytics = lazy(() =>
  import("../components/reports/ExpenseAnalytics/ExpenseAnalytics").then((m) => ({ default: m.ExpenseAnalytics }))
);
const ProfitabilityAnalytics = lazy(() =>
  import("../components/reports/Profitability/ProfitabilityAnalytics").then((m) => ({ default: m.ProfitabilityAnalytics }))
);
const CustomerAnalytics = lazy(() =>
  import("../components/reports/CustomerAnalytics/CustomerAnalytics").then((m) => ({ default: m.CustomerAnalytics }))
);
const ManpowerAnalytics = lazy(() =>
  import("../components/reports/ManpowerAnalytics/ManpowerAnalytics").then((m) => ({ default: m.ManpowerAnalytics }))
);
const QuantityAnalytics = lazy(() =>
  import("../components/reports/QuantityAnalytics/QuantityAnalytics").then((m) => ({ default: m.QuantityAnalytics }))
);
const CommercialAnalytics = lazy(() =>
  import("../components/reports/CommercialAnalytics/CommercialAnalytics").then((m) => ({ default: m.CommercialAnalytics }))
);

function ReportFallback() {
  return (
    <div className="flex items-center justify-center p-12 space-x-2 text-[var(--nu-text-muted)] bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl">
      <Loader2 className="w-5 h-5 animate-spin text-[var(--nu-accent)]" />
      <span className="text-xs font-bold font-mono">Loading Analytics Module...</span>
    </div>
  );
}

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTabKey>("executive");
  // Several countries in view: the comparison overview first; a country chip shows that country's report only; "All stacked" is the long one-after-another view.
  const [lens, setLens] = useState<CountryLensView>("overview");

  // Deep-link support (e.g. Completed Projects' "View Report" action):
  // /reports?prNo=PR-12059 pre-selects that PR Number on open. Read once at
  // mount only — useReportsData()'s initial state is a lazy useState
  // initializer, so this has no effect on later renders, and opening
  // /reports with no query param behaves exactly as before (INITIAL_REPORT_FILTERS).
  const [searchParams] = useSearchParams();
  const initialFilters = useMemo(() => {
    const prNo = searchParams.get("prNo");
    return prNo ? { prNo } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only, see comment above
  }, []);

  const {
    allProjects,
    filteredProjects,
    filters,
    setFilters,
    filterOptions,
    resetFilters,
    groups,
    invoiceDataAvailable,
    liveStatus,
    retryLiveData,
  } = useReportsData(initialFilters);

  const lensView = resolveLensView(lens, groups);
  const visibleGroups = lensView === "all" ? groups : lensView === "overview" ? [] : groups.filter((g) => g.key === lensView);

  const handleDrillDown = (target: string) => {
    if (target === "raised" || target === "outstanding") {
      setActiveTab("invoice");
    } else if (target === "received") {
      setActiveTab("collection");
    } else if (target === "expenses") {
      setActiveTab("expense");
    } else if (target === "profit") {
      setActiveTab("profitability");
    } else if (target === "wo") {
      setActiveTab("financial");
    }
  };

  const renderTab = (group: ReportGroupData) => {
    const projects = group.projects;
    const analytics = group.analytics;
    const invoiceLines = group.invoiceLines;
    switch (activeTab) {
      case "executive":
        return (
          <ExecutiveSummary
            projects={projects}
            analytics={analytics}
            onDrillDown={handleDrillDown}
            selectedPrNo={filters.prNo}
            invoiceDataAvailable={invoiceDataAvailable}
          />
        );
      case "financial":
        return <FinancialDashboard projects={projects} analytics={analytics} />;
      case "project-performance":
        return <ProjectPerformance projects={projects} analytics={analytics} />;
      // Invoice and Collection analytics are built entirely from invoice data: without invoice access they show one clear unavailable state
      // instead of empty charts and zero cards.
      case "invoice":
        return invoiceDataAvailable ? (
          <InvoiceAnalytics projects={projects} analytics={analytics} invoiceLines={invoiceLines} />
        ) : (
          <InvoiceDataUnavailable title="Invoice Analytics" />
        );
      case "collection":
        return invoiceDataAvailable ? (
          <CollectionAnalytics projects={projects} analytics={analytics} invoiceLines={invoiceLines} />
        ) : (
          <InvoiceDataUnavailable title="Collection Analytics" />
        );
      case "expense":
        return <ExpenseAnalytics projects={projects} analytics={analytics} />;
      case "profitability":
        return <ProfitabilityAnalytics projects={projects} analytics={analytics} />;
      case "customer":
        return <CustomerAnalytics analytics={analytics} />;
      case "resource":
        return <ManpowerAnalytics projects={projects} />;
      case "quantity":
        return <QuantityAnalytics projects={projects} analytics={analytics} />;
      case "commercial":
        return <CommercialAnalytics projects={projects} analytics={analytics} />;
      default:
        return null;
    }
  };

  return (
    <div className="-m-6 p-4 space-y-3.5 nu-fade-in">
      {/* PMO Hero Banner & Grouped Category Navigation */}
      <ReportHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        filteredCount={filteredProjects.length}
        totalCount={allProjects.length}
      />

      {/* Universal Report Filter Bar */}
      <ReportFilters
        filters={filters}
        setFilters={setFilters}
        resetFilters={resetFilters}
        options={filterOptions}
      />

      {/* Live data status — figures come only from live backend data (never the browser cache). */}
      {liveStatus === "loading" && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface)] px-4 py-2.5 text-xs text-[var(--nu-text-muted)]">
          <Loader2 size={14} className="animate-spin" />
          Loading live financial data…
        </div>
      )}
      {liveStatus === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertTriangle size={14} />
          <span className="flex-1">Couldn't load live financial data, so no figures are shown.</span>
          <button
            type="button"
            onClick={retryLiveData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-800 px-2.5 py-1 font-bold cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/40"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {/* Lazy-Loaded Active Analytics View — only once live data has loaded,
          so a loading or failed state never shows ₹0 placeholder figures.
          Phase 3: the report is rendered once per country + currency group, each in its own currency. Different currencies are never added
          together: with several groups in view each gets its own headed section, with one group (a specific country) there is no extra chrome. */}
      {liveStatus === "ready" && groups.length === 0 && (
        <div role="status" data-testid="reports-no-projects" className="rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface)] px-4 py-8 text-center text-xs text-[var(--nu-text-muted)]">
          No projects match the current filters.
        </div>
      )}
      {liveStatus === "ready" && groups.length > 0 && (
        <InvoiceAccessContext.Provider value={invoiceDataAvailable}>
          {groups.length > 1 && (
            <CountryReportLens groups={groups} invoiceDataAvailable={invoiceDataAvailable} value={lensView} onChange={setLens} />
          )}
          {lensView === "all" && groups.length > 1 && (
            <div role="note" data-testid="reports-group-note" className="rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface)] px-4 py-2.5 text-xs text-[var(--nu-text-muted)]">
              Showing {groups.length} country sections, each in its own currency. Amounts in different currencies are never added together.
            </div>
          )}
          {visibleGroups.map((group) => (
            <ReportGroupContext.Provider key={group.key} value={{ currency: group.currency, countryKey: group.countryKey, countryLabel: group.countryLabel, label: group.label }}>
              <section data-testid={`report-group-${group.key}`} aria-label={group.label} className="space-y-3.5">
                {groups.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--nu-accent)] pb-1.5">
                    <h2 className="text-sm font-extrabold uppercase tracking-wider text-[var(--nu-text)]">{group.countryLabel}</h2>
                    <span className="rounded-full bg-[var(--nu-accent)] px-2 py-0.5 text-[10px] font-extrabold text-white">{group.currency}</span>
                    <span className="text-[11px] text-[var(--nu-text-muted)]">
                      {group.projects.length} {group.projects.length === 1 ? "project" : "projects"}
                    </span>
                  </div>
                )}
                {group.manhourRefreshProblemProjects > 0 && (
                  <div role="alert" data-testid="reports-refresh-note" className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                    Manpower costing recalculation is pending or failed for {group.manhourRefreshProblemProjects} {group.manhourRefreshProblemProjects === 1 ? "project" : "projects"} in this section, so their man-hour figures may be out of date. Open the project to retry.
                  </div>
                )}
                {group.manhourRateMissingProjects > 0 && (
                  <div role="note" data-testid="reports-manhour-note" className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                    Rate not set: man-hour cost for {group.manhourRateMissingProjects} {group.manhourRateMissingProjects === 1 ? "project" : "projects"} in this section has no manpower conversion rate applied, so it is not included in this section's expenses or profit. Hours are still shown. An authorised Administrator or PMO Manager can set the country's rate in Manpower &gt; Manpower Conversion Rates.
                  </div>
                )}
                <Suspense fallback={<ReportFallback />}>{renderTab(group)}</Suspense>
              </section>
            </ReportGroupContext.Provider>
          ))}
        </InvoiceAccessContext.Provider>
      )}
    </div>
  );
}

export default ReportsPage;
