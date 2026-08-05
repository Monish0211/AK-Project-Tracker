import { useState, lazy, Suspense } from "react";
import { useReportsData } from "../components/reports/useReportsData";
import { ReportHeader, type ReportTabKey } from "../components/reports/Shared/ReportHeader";
import { ReportFilters } from "../components/reports/Shared/ReportFilters";
import { Loader2 } from "lucide-react";

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
  const {
    allProjects,
    filteredProjects,
    filters,
    setFilters,
    filterOptions,
    resetFilters,
    analytics,
  } = useReportsData();

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

      {/* Lazy-Loaded Active Analytics View */}
      <Suspense fallback={<ReportFallback />}>
        {activeTab === "executive" && (
          <ExecutiveSummary
            projects={filteredProjects}
            analytics={analytics}
            onDrillDown={handleDrillDown}
          />
        )}
        {activeTab === "financial" && (
          <FinancialDashboard projects={filteredProjects} analytics={analytics} />
        )}
        {activeTab === "project-performance" && (
          <ProjectPerformance projects={filteredProjects} analytics={analytics} />
        )}
        {activeTab === "invoice" && (
          <InvoiceAnalytics projects={filteredProjects} analytics={analytics} />
        )}
        {activeTab === "collection" && (
          <CollectionAnalytics projects={filteredProjects} analytics={analytics} />
        )}
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
    </div>
  );
}

export default ReportsPage;
