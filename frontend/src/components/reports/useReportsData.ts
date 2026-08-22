import { useState, useMemo, useEffect } from "react";
import type { Project } from "../../types/Project";
import type { Customer } from "../../types/CustomerModel";
import { getProjects, fetchAllProjectsFromApi } from "../../services/projectService";
import { getCustomers, loadCustomersForApp } from "../../services/customerService";
import { getTotalNonManhourCost } from "../../services/expenseService";
import { getTotalPaymentReceived } from "../../services/invoiceProgressService";

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

export function useReportsData() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [filters, setFilters] = useState<ReportFilterState>(INITIAL_REPORT_FILTERS);

  const loadData = () => {
    setAllProjects(getProjects());
    setAllCustomers(getCustomers());
  };

  useEffect(() => {
    loadData();

    fetchAllProjectsFromApi()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setAllProjects(items);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch projects for reports:", err);
      });

    loadCustomersForApp()
      .then((items) => setAllCustomers(items))
      .catch((err) => {
        console.warn("Failed to load Customer Master for reports:", err);
      });

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

    // Customer map for Customer Analytics
    const customerMap: Record<
      string,
      { client: string; projectCount: number; activeProjectCount: number; woValue: number; raised: number; received: number; outstanding: number; outstandingReceivable: number; expenses: number }
    > = {};

    // Department map for Financial / Performance Analytics
    const deptMap: Record<
      string,
      { department: string; projectCount: number; woValue: number; raised: number; received: number; expenses: number }
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

      // Invoices
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      let projectInvoiceRaised = 0;

      items.forEach((item: any) => {
        totalOrderedQty += item.qty || 0;

        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          const statusStr = String(line.status || "");
          if (statusStr !== "Cancelled") {
            const amt = line.invoiceAmountINR || 0;
            projectInvoiceRaised += amt;
            totalInvoicedQty += line.quantityBilled || 0;

            if (statusStr === "Paid") {
              paidInvoiceVal += amt;
              paidCount++;
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
      });

      totalInvoiceRaised += projectInvoiceRaised;

      const pReceived = Math.min(getTotalPaymentReceived(items), projectInvoiceRaised);
      totalPaymentReceived += pReceived;

      // Customer map aggregation
      const clientName = p.client || "Other Clients";
      if (!customerMap[clientName]) {
        customerMap[clientName] = { client: clientName, projectCount: 0, activeProjectCount: 0, woValue: 0, raised: 0, received: 0, outstanding: 0, outstandingReceivable: 0, expenses: 0 };
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

    const totalOutstanding = Math.max(0, totalWOValue - totalPaymentReceived);
    const totalOutstandingReceivable = Math.max(0, totalInvoiceRaised - totalPaymentReceived);
    const balanceToInvoice = Math.max(0, totalWOValue - totalInvoiceRaised);
    const totalActualProjectCost = totalExpenses;
    const totalProfit = totalWOValue - totalActualProjectCost;
    const grossProfit = totalProfit;
    const totalProfitPercentage = totalWOValue === 0 ? 0 : (totalProfit / totalWOValue) * 100;
    const profitMarginPercent = totalProfitPercentage;
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
