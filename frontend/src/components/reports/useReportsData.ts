import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import type { Project } from "../../types/Project";
import type { Customer } from "../../types/CustomerModel";
import { getCustomers, loadCustomersForApp } from "../../services/customerService";
import { getTotalNonManhourCost } from "../../services/expenseService";
import type { ReportInvoiceLine } from "../../services/invoiceService";
import { fetchLiveReportData } from "../../services/reportsLiveDataService";
import { pmoDataChangedMatches } from "../../utils/pmoDataChanged";

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
      if (pmoDataChangedMatches(event, ["project", "timesheet"])) scheduleReload();
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
    const regions = Array.from(new Set(allProjects.map((p) => p.domesticForeign).filter(Boolean))).sort();

    return {
      departments,
      clients,
      projectTitles,
      prNumbers,
      categories,
      statuses,
      projectManagers,
      regions,
    };
  }, [allProjects]);

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
      if (filters.countryRegion !== "ALL" && p.domesticForeign !== filters.countryRegion) return false;
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
  }, [allProjects, filters]);

  // Comprehensive Metrics Aggregations
  const analytics = useMemo(() => {
    let totalWOValue = 0;
    let totalInvoiceRaised = 0;
    let totalPaymentReceived = 0;
    let totalExpenses = 0;
    let totalBudget = 0;
    let totalOrderedQty = 0;
    let totalInvoicedQty = 0;

    let activeCount = 0;
    let completedCount = 0;
    let holdCount = 0;
    let cancelledCount = 0;

    // Invoice Status aggregates
    let draftInvoiceVal = 0;
    let raisedInvoiceVal = 0;
    let submittedInvoiceVal = 0;
    let partiallyPaidInvoiceVal = 0;
    let paidInvoiceVal = 0;
    let cancelledInvoiceVal = 0;

    let draftCount = 0;
    let raisedCount = 0;
    let submittedCount = 0;
    let partiallyPaidCount = 0;
    let paidCount = 0;

    // Ageing Buckets (for active open invoices)
    let ageing0to30 = 0;
    let ageing31to60 = 0;
    let ageing61to90 = 0;
    let ageing90Plus = 0;

    // Expense breakdowns
    let totalManhourExpenses = 0;
    let totalNonManhourExpenses = 0;

    // Liquidated Damages (Oct 2026) — recorded deductions only. Never
    // touches expenses, invoices or collections; Profit Before LD above is
    // unchanged and Final Profit = Profit − LD.
    let totalLdDeduction = 0;
    let ldAppliedCount = 0;
    let ldNotAppliedCount = 0;
    let ldNotRecordedCount = 0;

    // Customer map for Customer Analytics
    const customerMap: Record<
      string,
      { client: string; projectCount: number; activeProjectCount: number; woValue: number; raised: number; received: number; outstanding: number; outstandingReceivable: number; expenses: number; ld: number; finalProfit: number }
    > = {};

    // Department map for Financial / Performance Analytics
    const deptMap: Record<
      string,
      { department: string; projectCount: number; woValue: number; raised: number; received: number; expenses: number; ld: number; finalProfit: number }
    > = {};

    filteredProjects.forEach((p) => {
      const woVal = p.workOrderValueINR ?? p.workOrderValue ?? 0;
      totalWOValue += woVal;

      // Authoritative Actual Costs:
      // Non-manhour from ProjectExpense / nonManhourExpenses
      const nonManhour = getTotalNonManhourCost(p.nonManhourExpenses || []);
      // Man-hour cost from authoritative ProjectResource.manhourCost
      const manhour = (Array.isArray(p.resources) ? p.resources : []).reduce(
        (sum, r) => sum + (r.manhourCost || 0),
        0
      );
      const pExpenses = nonManhour + manhour;
      totalManhourExpenses += manhour;
      totalNonManhourExpenses += nonManhour;
      totalExpenses += pExpenses;

      const pLd = p.ldApplicable === true ? p.ldAmountINR || 0 : 0;
      totalLdDeduction += pLd;
      if (p.projectStatus === "Completed") {
        if (p.ldApplicable === true) ldAppliedCount++;
        else if (p.ldApplicable === false) ldNotAppliedCount++;
        else ldNotRecordedCount++;
      }

      // Approved Budget: Man-Hour Budget + Non-Man-Hour Budget
      const pBudget = (p.manhourBudgetAmount || 0) + (p.nonManhourBudgetAmount || 0);
      totalBudget += pBudget;

      // Status counters
      const st = (p.projectStatus || "").toLowerCase();
      const isActive = st.includes("active") || st.includes("in progress") || (!st.includes("completed") && !st.includes("closed") && !st.includes("hold") && !st.includes("cancelled") && !st.includes("deferred"));
      if (st.includes("active") || st.includes("in progress")) activeCount++;
      else if (st.includes("completed") || st.includes("closed")) completedCount++;
      else if (st.includes("hold") || st.includes("deferred")) holdCount++;
      else if (st.includes("cancelled")) cancelledCount++;
      else activeCount++;

      // Invoices — authoritative backend lines only (Issue #4 fix). Ordered
      // quantity is a QuantityItem figure (Projects module, not Invoices), so
      // it comes from the live quantity items and stays correct for viewers
      // without invoice access (invoiceItems is empty for them).
      const quantityItems = Array.isArray(p.quantityItems) ? p.quantityItems : [];
      quantityItems.forEach((item) => {
        totalOrderedQty += item.woQty || 0;
      });

      const projectLines = linesByProjectId.get(p.id) ?? [];
      let projectInvoiceRaised = 0;
      let projectPaidRaw = 0;

      projectLines.forEach((line) => {
        const statusStr = String(line.status || "");
        if (statusStr !== "Cancelled") {
          const amt = line.invoiceAmountINR || 0;
          projectInvoiceRaised += amt;
          totalInvoicedQty += line.quantityBilled || 0;

          if (statusStr === "Paid") {
            paidInvoiceVal += amt;
            paidCount++;
            projectPaidRaw += amt;
          } else if (statusStr === "Raised" || statusStr === "Submitted") {
            raisedInvoiceVal += amt;
            submittedInvoiceVal += amt;
            raisedCount++;
            submittedCount++;

            if (line.invoiceDate) {
              const days = Math.floor((new Date().getTime() - new Date(line.invoiceDate).getTime()) / (1000 * 3600 * 24));
              if (days <= 30) ageing0to30 += amt;
              else if (days <= 60) ageing31to60 += amt;
              else if (days <= 90) ageing61to90 += amt;
              else ageing90Plus += amt;
            } else {
              ageing0to30 += amt;
            }
          } else if (statusStr === "PartiallyPaid") {
            partiallyPaidInvoiceVal += amt;
            partiallyPaidCount++;
            raisedInvoiceVal += amt;
            raisedCount++;

            if (line.invoiceDate) {
              const days = Math.floor((new Date().getTime() - new Date(line.invoiceDate).getTime()) / (1000 * 3600 * 24));
              if (days <= 30) ageing0to30 += amt;
              else if (days <= 60) ageing31to60 += amt;
              else if (days <= 90) ageing61to90 += amt;
              else ageing90Plus += amt;
            } else {
              ageing0to30 += amt;
            }
          } else if (statusStr === "Draft") {
            draftInvoiceVal += amt;
            draftCount++;
          }
        } else {
          cancelledInvoiceVal += line.invoiceAmountINR || 0;
        }
      });

      // Per-project aggregate Payment Received — same rule as before this
      // fix: capped at this project's own Invoice Raised (a payment can
      // never exceed what was actually invoiced), never at Work Order
      // Value. No new cap introduced here — only the per-line data source
      // above changed (project.invoiceItems -> authoritative backend lines).
      const pReceived = Math.min(projectPaidRaw, projectInvoiceRaised);

      totalInvoiceRaised += projectInvoiceRaised;
      totalPaymentReceived += pReceived;

      // Customer map aggregation
      const clientName = p.client || "Other Clients";
      if (!customerMap[clientName]) {
        customerMap[clientName] = { client: clientName, projectCount: 0, activeProjectCount: 0, woValue: 0, raised: 0, received: 0, outstanding: 0, outstandingReceivable: 0, expenses: 0, ld: 0, finalProfit: 0 };
      }
      customerMap[clientName].projectCount += 1;
      if (isActive) {
        customerMap[clientName].activeProjectCount += 1;
      }
      customerMap[clientName].woValue += woVal;
      customerMap[clientName].raised += projectInvoiceRaised;
      customerMap[clientName].received += pReceived;
      customerMap[clientName].outstanding += Math.max(0, woVal - pReceived);
      customerMap[clientName].outstandingReceivable += Math.max(0, projectInvoiceRaised - pReceived);
      customerMap[clientName].expenses += pExpenses;
      customerMap[clientName].ld += pLd;
      customerMap[clientName].finalProfit += woVal - pExpenses - pLd;

      // Dept map aggregation
      const deptName = p.department || "General Engineering";
      if (!deptMap[deptName]) {
        deptMap[deptName] = { department: deptName, projectCount: 0, woValue: 0, raised: 0, received: 0, expenses: 0, ld: 0, finalProfit: 0 };
      }
      deptMap[deptName].projectCount += 1;
      deptMap[deptName].woValue += woVal;
      deptMap[deptName].raised += projectInvoiceRaised;
      deptMap[deptName].received += pReceived;
      deptMap[deptName].expenses += pExpenses;
      deptMap[deptName].ld += pLd;
      deptMap[deptName].finalProfit += woVal - pExpenses - pLd;
    });

    const totalOutstanding = Math.max(0, totalWOValue - totalPaymentReceived);
    const totalOutstandingReceivable = Math.max(0, totalInvoiceRaised - totalPaymentReceived);
    const balanceToInvoice = Math.max(0, totalWOValue - totalInvoiceRaised);
    const totalActualProjectCost = totalExpenses;
    const totalProfit = totalWOValue - totalActualProjectCost;
    const grossProfit = totalProfit;
    const totalProfitPercentage = totalWOValue === 0 ? 0 : (totalProfit / totalWOValue) * 100;
    const profitMarginPercent = totalProfitPercentage;
    const totalFinalProfit = totalProfit - totalLdDeduction;
    const finalProfitPercentage = totalWOValue === 0 ? 0 : (totalFinalProfit / totalWOValue) * 100;
    const collectionPercent = totalInvoiceRaised > 0 ? (totalPaymentReceived / totalInvoiceRaised) * 100 : 0;
    const remainingBudget = totalBudget - totalExpenses;
    const budgetVariance = totalBudget - totalExpenses;

    return {
      totalWOValue,
      totalInvoiceRaised,
      totalPaymentReceived,
      totalOutstanding,
      totalOutstandingReceivable,
      balanceToInvoice,
      totalExpenses,
      totalActualProjectCost,
      totalProfit,
      totalProfitPercentage,
      totalBudget,
      remainingBudget,
      budgetVariance,
      grossProfit,
      profitMarginPercent,
      totalLdDeduction,
      totalFinalProfit,
      finalProfitPercentage,
      ldCounts: {
        applied: ldAppliedCount,
        notApplied: ldNotAppliedCount,
        notRecorded: ldNotRecordedCount,
      },
      collectionPercent,
      totalManhourExpenses,
      totalNonManhourExpenses,
      totalOrderedQty,
      totalInvoicedQty,
      remainingQty: Math.max(0, totalOrderedQty - totalInvoicedQty),
      quantityCompletionPercent: totalOrderedQty > 0 ? (totalInvoicedQty / totalOrderedQty) * 100 : 0,

      // Counts
      projectCounts: {
        total: filteredProjects.length,
        active: activeCount,
        completed: completedCount,
        hold: holdCount,
        cancelled: cancelledCount,
      },
      invoiceCounts: {
        draft: draftCount,
        raised: raisedCount,
        submitted: submittedCount,
        partiallyPaid: partiallyPaidCount,
        paid: paidCount,
      },
      invoiceStatusValues: {
        draft: draftInvoiceVal,
        raised: raisedInvoiceVal,
        submitted: submittedInvoiceVal,
        partiallyPaid: partiallyPaidInvoiceVal,
        paid: paidInvoiceVal,
        cancelled: cancelledInvoiceVal,
      },
      ageing: {
        "0-30 Days": ageing0to30,
        "31-60 Days": ageing31to60,
        "61-90 Days": ageing61to90,
        "90+ Days": ageing90Plus,
      },

      // Aggregation Lists
      // Without invoice access, invoice-derived per-client/department figures
      // are null ("Not available" in the UI, blank cells in CSV/Excel — same
      // keys and order), never zero; lists then rank by Work Order Value.
      customerList: invoiceDataAvailable
        ? Object.values(customerMap).sort((a, b) => b.raised - a.raised)
        : Object.values(customerMap)
            .map((c) => ({ ...c, raised: null, received: null, outstanding: null, outstandingReceivable: null }))
            .sort((a, b) => b.woValue - a.woValue),
      departmentList: invoiceDataAvailable
        ? Object.values(deptMap).sort((a, b) => b.raised - a.raised)
        : Object.values(deptMap)
            .map((d) => ({ ...d, raised: null, received: null }))
            .sort((a, b) => b.woValue - a.woValue),
      invoiceDataAvailable,
    };
  }, [filteredProjects, linesByProjectId, invoiceDataAvailable]);

  return {
    allProjects,
    allCustomers,
    filteredProjects,
    filters,
    setFilters,
    filterOptions,
    resetFilters: () => setFilters(INITIAL_REPORT_FILTERS),
    analytics,
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
