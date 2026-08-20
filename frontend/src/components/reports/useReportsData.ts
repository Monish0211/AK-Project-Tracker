import { useState, useMemo, useEffect } from "react";
import type { Project } from "../../types/Project";
import type { Customer } from "../../types/CustomerModel";
import { getProjects } from "../../services/projectService";
import { getCustomers } from "../../services/customerService";
import { getTotalNonManhourCost, getTotalManhourCost } from "../../services/expenseService";
import { getTotalPaymentReceived } from "../../services/invoiceProgressService";

export interface ReportFilterState {
  dateRange: { start: string; end: string };
  department: string;
  client: string;
  project: string;
  prNo: string;
  category: string;
  status: string;
  invoiceStatus: string;
  expenseCategory: string;
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
  invoiceStatus: "ALL",
  expenseCategory: "ALL",
  projectManager: "ALL",
  countryRegion: "ALL",
};

export function useReportsData() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [filters, setFilters] = useState<ReportFilterState>(INITIAL_REPORT_FILTERS);

  // Load live data from services
  const loadData = () => {
    const p = getProjects();
    const c = getCustomers();
    setAllProjects(p);
    setAllCustomers(c);
  };

  useEffect(() => {
    loadData();
    const handleDataChanged = () => loadData();
    window.addEventListener("pmo:data-changed", handleDataChanged);
    window.addEventListener("storage", handleDataChanged);
    return () => {
      window.removeEventListener("pmo:data-changed", handleDataChanged);
      window.removeEventListener("storage", handleDataChanged);
    };
  }, []);

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
      if (filters.dateRange.start && p.projectStartDate && p.projectStartDate < filters.dateRange.start) return false;
      const effectiveEndDate = p.actualCompletionDate || p.projectEndDate;
      if (filters.dateRange.end && effectiveEndDate && effectiveEndDate > filters.dateRange.end) return false;

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
    let paidInvoiceVal = 0;
    let cancelledInvoiceVal = 0;

    let draftCount = 0;
    let raisedCount = 0;
    let submittedCount = 0;
    let paidCount = 0;

    // Ageing Buckets
    let ageing0to30 = 0;
    let ageing31to60 = 0;
    let ageing61to90 = 0;
    let ageing90Plus = 0;

    // Expense breakdowns
    let totalManhourExpenses = 0;
    let totalNonManhourExpenses = 0;

    // Customer map for Customer Analytics
    const customerMap: Record<
      string,
      { client: string; projectCount: number; woValue: number; raised: number; received: number; outstanding: number }
    > = {};

    // Department map for Financial / Performance Analytics
    const deptMap: Record<
      string,
      { department: string; projectCount: number; woValue: number; raised: number; received: number; expenses: number }
    > = {};

    filteredProjects.forEach((p) => {
      const woVal = p.workOrderValueINR ?? p.workOrderValue ?? 0;
      totalWOValue += woVal;

      const nonManhour = getTotalNonManhourCost(p.nonManhourExpenses || []);
      const manhour = getTotalManhourCost(p.manhourExpenses || []);
      const pExpenses = nonManhour + manhour;
      totalManhourExpenses += manhour;
      totalNonManhourExpenses += nonManhour;
      totalExpenses += pExpenses;

      const pBudget = (p.manhourBudgetAmount || 0) + (p.nonManhourBudgetAmount || 0) || (p.totalProjectBudget || woVal);
      totalBudget += pBudget;

      // Status counters
      const st = (p.projectStatus || "").toLowerCase();
      if (st.includes("active") || st.includes("in progress")) activeCount++;
      else if (st.includes("completed") || st.includes("closed")) completedCount++;
      else if (st.includes("hold") || st.includes("deferred")) holdCount++;
      else if (st.includes("cancelled")) cancelledCount++;
      else activeCount++;

      // Invoices
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      let projectInvoiceRaised = 0;

      items.forEach((item: any) => {
        // InvoiceItem's real ordered-quantity field is `qty` (types/InvoiceItem.ts)
        // — there is no totalQuantity/orderedQuantity/quantity field on it.
        totalOrderedQty += item.qty || 0;

        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          const statusStr = String(line.status || "");
          if (statusStr !== "Cancelled") {
            const amt = line.invoiceAmountINR || 0;
            projectInvoiceRaised += amt;
            // Invoiced Quantity — same rule as QuantityTable.tsx/QuantityProgress.tsx: every non-Cancelled line's billed qty.
            totalInvoicedQty += line.quantityBilled || 0;

            if (statusStr === "Paid") {
              paidInvoiceVal += amt;
              paidCount++;
            } else if (statusStr === "Raised" || statusStr === "Submitted") {
              raisedInvoiceVal += amt;
              submittedInvoiceVal += amt;
              raisedCount++;
              submittedCount++;

              // Calculate ageing based on line.invoiceDate
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
      });

      totalInvoiceRaised += projectInvoiceRaised;

      // Payment Received — delegates to the same canonical
      // invoiceProgressService.ts function Dashboard/View Project use
      // (getTotalPaymentReceived), rather than re-deriving the status rule
      // here a second time. Under the current business rule, a line counts
      // as received once it reaches Raised / Submitted, PartiallyPaid, or
      // Paid — never the legacy Excel-import-only project.paymentReceivedINR
      // field, which is frozen at import time and never updated by the
      // Invoice module.
      const pReceived = Math.min(getTotalPaymentReceived(items), projectInvoiceRaised);
      totalPaymentReceived += pReceived;

      // Customer map aggregation
      const clientName = p.client || "Other Clients";
      if (!customerMap[clientName]) {
        customerMap[clientName] = { client: clientName, projectCount: 0, woValue: 0, raised: 0, received: 0, outstanding: 0 };
      }
      customerMap[clientName].projectCount += 1;
      customerMap[clientName].woValue += woVal;
      customerMap[clientName].raised += projectInvoiceRaised;
      customerMap[clientName].received += pReceived;
      // Outstanding — Reports' management-level KPI: Work Order Value
      // minus Payment Received. Deliberately NOT Invoice Raised minus
      // Payment Received (that's the Invoice module's own, separate
      // Outstanding concept, computed in invoiceProgressService.ts's
      // getProjectCommercialSummary and left unchanged there).
      customerMap[clientName].outstanding += Math.max(0, woVal - pReceived);

      // Dept map aggregation
      const deptName = p.department || "General Engineering";
      if (!deptMap[deptName]) {
        deptMap[deptName] = { department: deptName, projectCount: 0, woValue: 0, raised: 0, received: 0, expenses: 0 };
      }
      deptMap[deptName].projectCount += 1;
      deptMap[deptName].woValue += woVal;
      deptMap[deptName].raised += projectInvoiceRaised;
      deptMap[deptName].received += pReceived;
      deptMap[deptName].expenses += pExpenses;
    });

    // Outstanding — Reports' management-level KPI: Total Work Order Value
    // minus Payment Received across all included projects. Deliberately
    // NOT Invoice Raised minus Payment Received — that's the Invoice
    // module's own, separate Outstanding concept (getProjectCommercialSummary's
    // outstandingCollection), which stays unchanged. Also never the same
    // as Balance to Invoice below.
    const totalOutstanding = Math.max(0, totalWOValue - totalPaymentReceived);
    const balanceToInvoice = Math.max(0, totalWOValue - totalInvoiceRaised);
    const grossProfit = totalInvoiceRaised - totalExpenses;
    const profitMarginPercent = totalInvoiceRaised > 0 ? (grossProfit / totalInvoiceRaised) * 100 : 0;
    const collectionPercent = totalInvoiceRaised > 0 ? (totalPaymentReceived / totalInvoiceRaised) * 100 : 0;
    const remainingBudget = totalBudget - totalExpenses;
    const budgetVariance = totalBudget - totalExpenses;

    return {
      totalWOValue,
      totalInvoiceRaised,
      totalPaymentReceived,
      totalOutstanding,
      balanceToInvoice,
      totalExpenses,
      totalBudget,
      remainingBudget,
      budgetVariance,
      grossProfit,
      profitMarginPercent,
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
        paid: paidCount,
      },
      invoiceStatusValues: {
        draft: draftInvoiceVal,
        raised: raisedInvoiceVal,
        submitted: submittedInvoiceVal,
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
      customerList: Object.values(customerMap).sort((a, b) => b.raised - a.raised),
      departmentList: Object.values(deptMap).sort((a, b) => b.raised - a.raised),
    };
  }, [filteredProjects]);

  return {
    allProjects,
    allCustomers,
    filteredProjects,
    filters,
    setFilters,
    filterOptions,
    resetFilters: () => setFilters(INITIAL_REPORT_FILTERS),
    analytics,
  };
}
