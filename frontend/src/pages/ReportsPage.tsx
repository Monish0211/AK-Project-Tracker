import { useState, lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useReportsData } from "../components/reports/useReportsData";
import { ReportHeader, type ReportTabKey } from "../components/reports/Shared/ReportHeader";
import { ReportFilters } from "../components/reports/Shared/ReportFilters";
import { InvoiceAccessContext } from "../components/reports/Shared/invoiceAccess";
import { InvoiceDataUnavailable } from "../components/reports/Shared/InvoiceDataUnavailable";
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
    analytics,
    authoritativeInvoiceLines,
    invoiceDataAvailable,
    liveStatus,
    retryLiveData,
  } = useReportsData(initialFilters);

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
          so a loading or failed state never shows ₹0 placeholder figures. */}
      {liveStatus === "ready" && (
      <InvoiceAccessContext.Provider value={invoiceDataAvailable}>
      <Suspense fallback={<ReportFallback />}>
        {activeTab === "executive" && (
          <ExecutiveSummary
            projects={filteredProjects}
            analytics={analytics}
            onDrillDown={handleDrillDown}
            selectedPrNo={filters.prNo}
            invoiceDataAvailable={invoiceDataAvailable}
          />
        )}
        {activeTab === "financial" && (
          <FinancialDashboard projects={filteredProjects} analytics={analytics} />
        )}
        {activeTab === "project-performance" && (
          <ProjectPerformance projects={filteredProjects} analytics={analytics} />
        )}
        {/* Invoice and Collection analytics are built entirely from invoice
            data: without invoice access they show one clear unavailable
            state instead of empty charts and ₹0 cards. */}
        {activeTab === "invoice" &&
          (invoiceDataAvailable ? (
            <InvoiceAnalytics
              projects={filteredProjects}
              analytics={analytics}
              invoiceLines={authoritativeInvoiceLines}
            />
          ) : (
            <InvoiceDataUnavailable title="Invoice Analytics" />
          ))}
        {activeTab === "collection" &&
          (invoiceDataAvailable ? (
            <CollectionAnalytics
              projects={filteredProjects}
              analytics={analytics}
              invoiceLines={authoritativeInvoiceLines}
            />
          ) : (
            <InvoiceDataUnavailable title="Collection Analytics" />
          ))}
        {activeTab === "expense" && (
          <ExpenseAnalytics projects={filteredProjects} analytics={analytics} />
        )}
        {activeTab === "profitability" && (
          <ProfitabilityAnalytics projects={filteredProjects} analytics={analytics} />
        )}
        {activeTab === "customer" && <CustomerAnalytics analytics={analytics} />}
        {activeTab === "resource" && <ManpowerAnalytics projects={filteredProjects} />}
        {activeTab === "quantity" && (
          <QuantityAnalytics projects={filteredProjects} analytics={analytics} />
        )}
        {activeTab === "commercial" && (
          <CommercialAnalytics projects={filteredProjects} analytics={analytics} />
        )}
      </Suspense>
      </InvoiceAccessContext.Provider>
      )}
    </div>
  );
}

export default ReportsPage;
