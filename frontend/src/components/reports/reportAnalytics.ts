import type { Project } from "../../types/Project";
import { getTotalNonManhourCost } from "../../services/expenseService";
import type { ReportInvoiceLine } from "../../services/invoiceService";
import { lineCashINR, lineSettledINR } from "../../utils/invoiceCash";

/**
 * The Reports aggregation (Work Order Value, invoices, collections, expenses, budget, LD, customer and department rollups) over ONE set of projects.
 * Moved out of useReportsData UNCHANGED so it can run once per country group (Phase 3): every project handed to it is in the SAME currency, so
 * every sum is a sum of like with like. It never converts and never mixes currencies; the caller decides the grouping (see reportCurrency.ts).
 */
export function computeReportAnalytics(
  filteredProjects: Project[],
  linesByProjectId: Map<string, ReportInvoiceLine[]>,
  invoiceDataAvailable: boolean
) {
  let totalWOValue = 0;
  let totalInvoiceRaised = 0;
  let totalPaymentReceived = 0;
  let totalSettledAmount = 0;
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
    let projectSettledRaw = 0;

    projectLines.forEach((line) => {
      const statusStr = String(line.status || "");
      if (statusStr !== "Cancelled") {
        const amt = line.invoiceAmountINR || 0;
        projectInvoiceRaised += amt;
        // Invoice Payment workflow (Nov 2026): actual recorded cash (even a part-payment) and what is settled (cash + TDS) — see utils/invoiceCash.ts. Legacy lines keep the Paid-status rule.
        projectPaidRaw += lineCashINR(line);
        projectSettledRaw += lineSettledINR(line);
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

    // Per-project aggregate Payment Received — same rule as before this
    // fix: capped at this project's own Invoice Raised (a payment can
    // never exceed what was actually invoiced), never at Work Order
    // Value. No new cap introduced here — only the per-line data source
    // above changed (project.invoiceItems -> authoritative backend lines).
    const pReceived = Math.min(projectPaidRaw, projectInvoiceRaised);
    totalSettledAmount += Math.min(projectSettledRaw, projectInvoiceRaised);

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

  // Outstanding is measured against what is SETTLED (cash plus counted deductions such as TDS), never against cash alone.
  const totalOutstanding = Math.max(0, totalWOValue - totalSettledAmount);
  const totalOutstandingReceivable = Math.max(0, totalInvoiceRaised - totalSettledAmount);
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
}

export type ReportAnalytics = ReturnType<typeof computeReportAnalytics>;
