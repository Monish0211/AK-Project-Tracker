import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import type { Project } from "../../types/Project";
import type { Customer } from "../../types/CustomerModel";
import { getCustomers, loadCustomersForApp } from "../../services/customerService";
import type { ReportInvoiceLine } from "../../services/invoiceService";
import { fetchLiveReportData } from "../../services/reportsLiveDataService";
import { pmoDataChangedMatches } from "../../utils/pmoDataChanged";
import { usePrCategoryCountries } from "../../pages/Projects/usePrCategoryCountries";
import { computeReportAnalytics } from "./reportAnalytics";
import type { ReportAnalytics } from "./reportAnalytics";
import { countryOptions, groupReportProjects, matchesCountryFilter } from "./reportCurrency";
import type { ReportGroup } from "./reportCurrency";

export interface ReportFilterState {
  dateRange: { start: string; end: string };
  department: string;
  client: string;
  project: string;
  prNo: string;
  category: string;
  status: string;
  projectManager: string;
  countryRegion: string;
}

export const INITIAL_REPORT_FILTERS: ReportFilterState = {
  dateRange: { start: "", end: "" },
  department: "ALL",
  client: "ALL",
  project: "ALL",
  prNo: "ALL",
  category: "ALL",
  status: "ALL",
  projectManager: "ALL",
  countryRegion: "ALL",
};

/** One country + currency section of the report: its projects (report basis), its own analytics and its own invoice lines. */
export interface ReportGroupData extends ReportGroup {
  analytics: ReportAnalytics;
  invoiceLines: ReportInvoiceLine[];
}

/** "loading" until the first live load settles; "error" only when no live data could be shown. */
export type ReportsLiveStatus = "loading" | "ready" | "error";

/**
 * `initialFilters` — optional, applied once at mount only (e.g. deep-linking
 * in from Completed Projects' "View Report" action with a specific PR
 * Number already known). Merged onto INITIAL_REPORT_FILTERS exactly like
 * every other default, so a caller with no override keeps today's exact
 * behavior unchanged.
 */
export function useReportsData(initialFilters?: Partial<ReportFilterState>) {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [filters, setFilters] = useState<ReportFilterState>(() => ({
    ...INITIAL_REPORT_FILTERS,
    ...initialFilters,
  }));

  // Every invoice line across every authorized project — the same backend
  // source Dashboard's Invoice Raised KPI uses (Issue #4 fix). Now loaded
  // together with the projects by fetchLiveReportData(), so the KPI cards,
  // the registry table and every per-project figure share one live snapshot.
  const [authoritativeInvoiceLines, setAuthoritativeInvoiceLines] = useState<ReportInvoiceLine[]>([]);
  // false = the caller has no Invoices module access: invoice figures are
  // "Not available" (blank in CSV/Excel), never ₹0.
  const [invoiceDataAvailable, setInvoiceDataAvailable] = useState(true);
  const [liveStatus, setLiveStatus] = useState<ReportsLiveStatus>("loading");
  // The backend's PR Category -> country reference: a project's country is the one its stored PR Category maps to (never its PR Number prefix).
  // Null while loading, or for a caller without access to it: projects then fall back to their stored category name as their country label.
  const countryReference = usePrCategoryCountries(true);

  // Reports data consistency fix (Oct 2026) — every financial figure on this
  // page comes from live backend rows (see reportsLiveDataService.ts), never
  // from the per-browser localStorage project mirror, which only held
  // expense/quantity/invoice rows for projects this browser had opened and
  // was never refreshed when someone else changed them. One request at a
  // time: a change event arriving mid-load queues exactly one follow-up load.
  const isMounted = useRef(true);
  const inFlight = useRef(false);
  const reloadQueued = useRef(false);
  const hasLiveData = useRef(false);

  const loadLiveData = useCallback(function load() {
    if (inFlight.current) {
      reloadQueued.current = true;
      return;
    }
    inFlight.current = true;
    fetchLiveReportData()
      .then((live) => {
        if (!isMounted.current) return;
        hasLiveData.current = true;
        setAllProjects(live.projects);
        setAuthoritativeInvoiceLines(live.invoiceLines ?? []);
        setInvoiceDataAvailable(live.invoiceLines !== null);
        setLiveStatus("ready");
      })
      .catch((err) => {
        console.warn("Failed to load live Reports data:", err);
        // Keep the last good live snapshot if there is one; never fall back
        // to the stale mirror for financial figures.
        if (isMounted.current && !hasLiveData.current) setLiveStatus("error");
      })
      .finally(() => {
        inFlight.current = false;
        if (reloadQueued.current && isMounted.current) {
          reloadQueued.current = false;
          load();
        }
      });
  }, []);

  const retryLiveData = useCallback(() => {
    setLiveStatus((s) => (s === "error" ? "loading" : s));
    loadLiveData();
  }, [loadLiveData]);

  useEffect(() => {
    isMounted.current = true;
    setAllCustomers(getCustomers());
    loadLiveData();

    loadCustomersForApp()
      .then((items) => {
        if (isMounted.current) setAllCustomers(items);
      })
      .catch((err) => {
        console.warn("Failed to load Customer Master for reports:", err);
      });

    // Refresh only on changes that can move a financial figure: project
    // saves (invoices, quantities, expenses and milestones all dispatch
    // entity "project") and timesheet imports (resource man-hour costs).
    // Customer events just refresh the customer list. Debounced so a burst
    // of saves collapses into one reload; the live loader never writes the
    // mirror itself, so it cannot re-trigger this listener.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        loadLiveData();
      }, 500);
    };
    const handleDataChanged = (event: Event) => {
      if (!(event as CustomEvent).detail) {
        scheduleReload();
        return;
      }
      if (pmoDataChangedMatches(event, ["customer"])) setAllCustomers(getCustomers());
      // "employee": an employee's hourly-rate change recalculates the manpower cost of every project they work on (Phase 4 / Option A).
      if (pmoDataChangedMatches(event, ["project", "timesheet", "employee"])) scheduleReload();
    };
    // Cross-tab: another tab saving projects rewrites the "projects" key.
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "projects") scheduleReload();
    };
    window.addEventListener("pmo:data-changed", handleDataChanged);
    window.addEventListener("storage", handleStorage);
    return () => {
      isMounted.current = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("pmo:data-changed", handleDataChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadLiveData]);

  const linesByProjectId = useMemo(() => {
    const map = new Map<string, ReportInvoiceLine[]>();
    for (const line of authoritativeInvoiceLines) {
      const bucket = map.get(line.projectId);
      if (bucket) bucket.push(line);
      else map.set(line.projectId, [line]);
    }
    return map;
  }, [authoritativeInvoiceLines]);

  // Filter options lists
  const filterOptions = useMemo(() => {
    const departments = Array.from(new Set(allProjects.map((p) => p.department).filter(Boolean))).sort();
    const clients = Array.from(new Set(allProjects.map((p) => p.client).filter(Boolean))).sort();
    const projectTitles = Array.from(new Set(allProjects.map((p) => p.projectTitle).filter(Boolean))).sort();
    const prNumbers = Array.from(new Set(allProjects.map((p) => p.prNo).filter(Boolean))).sort();
    const categories = Array.from(new Set(allProjects.map((p) => p.prCategory).filter(Boolean))).sort();
    const statuses = Array.from(new Set(allProjects.map((p) => p.projectStatus).filter(Boolean))).sort();
    const projectManagers = Array.from(
      new Set(
        allProjects
          .flatMap((p) => [p.primaryProjectManager, p.secondaryProjectManager, (p as any).projectManager])
          .filter(Boolean)
      )
    ).sort();
    // Countries actually present in the projects this user may read (the backend already limits the list to authorized countries).
    const countries = countryOptions(allProjects, countryReference);

    return {
      departments,
      clients,
      projectTitles,
      prNumbers,
      categories,
      statuses,
      projectManagers,
      countries,
    };
  }, [allProjects, countryReference]);

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return allProjects.filter((p) => {
      const pm = (p as any).projectManager;
      if (filters.department !== "ALL" && p.department !== filters.department) return false;
      if (filters.client !== "ALL" && p.client !== filters.client) return false;
      if (filters.project !== "ALL" && p.projectTitle !== filters.project) return false;
      if (filters.prNo !== "ALL" && p.prNo !== filters.prNo) return false;
      if (filters.category !== "ALL" && p.prCategory !== filters.category) return false;
      if (filters.status !== "ALL" && p.projectStatus !== filters.status) return false;
      if (!matchesCountryFilter(p, filters.countryRegion, countryReference)) return false;
      if (
        filters.projectManager !== "ALL" &&
        p.primaryProjectManager !== filters.projectManager &&
        p.secondaryProjectManager !== filters.projectManager &&
        pm !== filters.projectManager
      ) {
        return false;
      }

      // Date range filtering: lifecycle overlap
      const effectiveEndDate = p.actualCompletionDate || p.projectEndDate;
      if (filters.dateRange.start && effectiveEndDate && effectiveEndDate < filters.dateRange.start) return false;
      if (filters.dateRange.end && p.projectStartDate && p.projectStartDate > filters.dateRange.end) return false;

      return true;
    });
  }, [allProjects, filters, countryReference]);

  // Comprehensive Metrics Aggregations, once per country + currency group. The aggregation itself lives in reportAnalytics.ts (moved unchanged);
  // every project handed to it is in ONE currency, so each group's sums are like with like. Groups are never added together: there is no
  // all-countries money total anywhere in Reports.
  const groups = useMemo<ReportGroupData[]>(
    () =>
      groupReportProjects(filteredProjects, countryReference).map((group) => ({
        ...group,
        analytics: computeReportAnalytics(group.projects, linesByProjectId, invoiceDataAvailable),
        invoiceLines: group.projects.flatMap((p) => linesByProjectId.get(p.id) ?? []),
      })),
    [filteredProjects, countryReference, linesByProjectId, invoiceDataAvailable]
  );

  return {
    allProjects,
    allCustomers,
    filteredProjects,
    filters,
    setFilters,
    filterOptions,
    resetFilters: () => setFilters(INITIAL_REPORT_FILTERS),
    groups,
    countryReference,
    invoiceDataAvailable,
    liveStatus,
    retryLiveData,
    // Reports drill-down detail-section fix (Sep 2026) — the same
    // authoritative backend invoice lines analytics above is already built
    // from (see linesByProjectId's own comment). Exposed additively so
    // per-line detail components (Monthly Billing, Invoice Ledger,
    // Collection Trend, Overdue Table) can stop reading the legacy,
    // browser-local-only project.invoiceItems mirror — the same staleness
    // Issue #4 fixed for the aggregate totals, never migrated in these four
    // components. No new fetch: this is the single request already made
    // above: fetchAllInvoiceLinesForCaller(), now part of fetchLiveReportData().
    authoritativeInvoiceLines,
  };
}
