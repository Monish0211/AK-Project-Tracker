import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actualProjectCost,
  calculateDepartmentCompletion,
  calculateTimelineAlert,
  classifyHealth,
  dashboardOutstanding,
  departmentWorkloadPercent,
  formatCurrencyCompact,
  grossProfit,
  invoiceRaisedFromLines,
  paymentReceivedFromLines,
  profitPercentage,
  projectCommercialTotals,
  teamLeadStatus,
} from "./dashboard.formulas.js";

test("invoice raised excludes Cancelled and includes Draft & PartiallyPaid", () => {
  const raised = invoiceRaisedFromLines([
    { status: "Draft", invoiceAmountINR: 3000 },
    { status: "Raised", invoiceAmountINR: 2000 },
    { status: "PartiallyPaid", invoiceAmountINR: 1500 },
    { status: "Paid", invoiceAmountINR: 1000 },
    { status: "Cancelled", invoiceAmountINR: 9999 },
  ]);
  assert.equal(raised, 7500);
});

test("payment received is Paid lines ONLY (excludes Draft, Raised, PartiallyPaid, Cancelled)", () => {
  const received = paymentReceivedFromLines([
    { status: "Draft", invoiceAmountINR: 3000 },
    { status: "Raised", invoiceAmountINR: 2000 },
    { status: "PartiallyPaid", invoiceAmountINR: 1500 },
    { status: "Paid", invoiceAmountINR: 1000 },
    { status: "Cancelled", invoiceAmountINR: 50 },
  ]);
  assert.equal(received, 1000);
});

test("per-project commercial caps raised and paid at WO value", () => {
  const { totalInvoiceRaised, totalPaymentReceived } = projectCommercialTotals(4000, [
    { status: "Paid", invoiceAmountINR: 5000 },
  ]);
  assert.equal(totalInvoiceRaised, 4000);
  assert.equal(totalPaymentReceived, 4000);
});

test("contract outstanding uses canonical paid-only cash realized", () => {
  const totalWOValue = 100000;
  const lines = [
    { status: "Raised", invoiceAmountINR: 40000 },
    { status: "PartiallyPaid", invoiceAmountINR: 20000 },
    { status: "Paid", invoiceAmountINR: 30000 },
  ];
  const commercial = projectCommercialTotals(totalWOValue, lines);
  assert.equal(commercial.totalInvoiceRaised, 90000);
  assert.equal(commercial.totalPaymentReceived, 30000);
  const outstanding = dashboardOutstanding(totalWOValue, commercial.totalPaymentReceived);
  assert.equal(outstanding, 70000); // 100000 - 30000
});

test("project health classifies missing end date as scheduleNotSet", () => {
  const today = new Date(2026, 7, 22);

  // 1. Missing end date -> scheduleNotSet
  const noEnd = classifyHealth({
    projectStatus: "Active",
    startDateKey: "2026-01-01",
    endDateKey: "",
    totalPendingQty: 0,
    pendingInvoicePercentage: 0,
    today,
  });
  assert.equal(noEnd, "scheduleNotSet");

  // 2. Future start date with valid end date -> notStarted
  const future = classifyHealth({
    projectStatus: "Active",
    startDateKey: "2026-09-01",
    endDateKey: "2026-12-31",
    totalPendingQty: 0,
    pendingInvoicePercentage: 0,
    today,
  });
  assert.equal(future, "notStarted");

  // 3. Past end date -> delayed
  const delayed = classifyHealth({
    projectStatus: "Active",
    startDateKey: "2026-01-01",
    endDateKey: "2026-08-01",
    totalPendingQty: 0,
    pendingInvoicePercentage: 0,
    today,
  });
  assert.equal(delayed, "delayed");

  // 4. Near end date (<=14 days) + pending work -> atRisk
  const atRisk = classifyHealth({
    projectStatus: "Active",
    startDateKey: "2026-01-01",
    endDateKey: "2026-08-30",
    totalPendingQty: 10,
    pendingInvoicePercentage: 20,
    today,
  });
  assert.equal(atRisk, "atRisk");

  // 5. Normal valid schedule (>14 days) -> onTrack
  const onTrack = classifyHealth({
    projectStatus: "Active",
    startDateKey: "2026-01-01",
    endDateKey: "2026-12-31",
    totalPendingQty: 0,
    pendingInvoicePercentage: 0,
    today,
  });
  assert.equal(onTrack, "onTrack");

  // 6. Completed and Cancelled are skipped
  assert.equal(
    classifyHealth({
      projectStatus: "Completed",
      startDateKey: "2026-01-01",
      endDateKey: "2026-12-31",
      totalPendingQty: 0,
      pendingInvoicePercentage: 0,
      today,
    }),
    "skip"
  );
  assert.equal(
    classifyHealth({
      projectStatus: "Cancelled",
      startDateKey: "2026-01-01",
      endDateKey: "2026-12-31",
      totalPendingQty: 0,
      pendingInvoicePercentage: 0,
      today,
    }),
    "skip"
  );
});

test("department workload percent handles zero and non-zero workloads", () => {
  // Empty department -> 0%
  assert.equal(departmentWorkloadPercent(0, 0, 0), 0);

  // Small non-zero workload -> clamped to minimum 35%
  assert.equal(departmentWorkloadPercent(1, 0, 0), 35); // 1*14 = 14 -> clamped to 35

  // Normal workload
  assert.equal(departmentWorkloadPercent(2, 5, 2), 60); // 2*14 + 5*4 + 2*6 = 28 + 20 + 12 = 60

  // High workload -> clamped to 98% cap
  assert.equal(departmentWorkloadPercent(10, 10, 10), 98); // 140 + 40 + 60 = 240 -> clamped to 98
});

test("actual project cost sums manhour cost and other expenses", () => {
  // Case 1: No manhour cost + no other expenses -> 0
  assert.equal(actualProjectCost(0, 0), 0);
  // Case 2: Manhour cost only
  assert.equal(actualProjectCost(56703.5, 0), 56703.5);
  // Case 3: Other project expense only
  assert.equal(actualProjectCost(0, 8000), 8000);
  // Case 4: Both
  assert.equal(actualProjectCost(56703.5, 8000), 64703.5);
});

test("profit and profit % calculations using actual project cost", () => {
  // 1. No cost: WO = 100,000, Actual Cost = 0 -> Profit = 100,000, Profit % = 100%
  const profit1 = grossProfit(100000, actualProjectCost(0, 0));
  assert.equal(profit1, 100000);
  assert.equal(profitPercentage(100000, profit1), 100);

  // 2. Manhour + Other Expenses: WO = 100,000, Manhour = 20,000, Expenses = 10,000 -> Actual Cost = 30,000, Profit = 70,000, Profit % = 70%
  const actualCost2 = actualProjectCost(20000, 10000);
  assert.equal(actualCost2, 30000);
  const profit2 = grossProfit(100000, actualCost2);
  assert.equal(profit2, 70000);
  assert.equal(profitPercentage(100000, profit2), 70);

  // 3. Cost exceeds WO: WO = 100,000, Actual Cost = 120,000 -> Profit = -20,000, Profit % = -20% (NOT clamped)
  const actualCost3 = 120000;
  const profit3 = grossProfit(100000, actualCost3);
  assert.equal(profit3, -20000);
  assert.equal(profitPercentage(100000, profit3), -20);

  // 4. Zero WO: WO = 0 -> Profit % = 0 (No NaN/Infinity)
  assert.equal(profitPercentage(0, 50000), 0);
  assert.equal(profitPercentage(0, 0), 0);
  assert.equal(profitPercentage(0, -10000), 0);

  // 5. PR-7087 verification
  const pr7087Wo = 2785483.1163;
  const pr7087Cost = actualProjectCost(56703.5, 8000);
  assert.equal(pr7087Cost, 64703.5);
  const pr7087Profit = grossProfit(pr7087Wo, pr7087Cost);
  assert.equal(pr7087Profit, 2720779.6163);
  const pr7087Pct = profitPercentage(pr7087Wo, pr7087Profit);
  assert.equal(parseFloat(pr7087Pct.toFixed(2)), 97.68);
});

test("timeline alert buckets", () => {
  const today = new Date(2026, 7, 22);
  const overdue = calculateTimelineAlert("2026-08-20", today);
  assert.equal(overdue?.status, "Overdue");
  const dueToday = calculateTimelineAlert("2026-08-22", today);
  assert.equal(dueToday?.status, "Due Today");
  const dueSoon = calculateTimelineAlert("2026-08-25", today);
  assert.equal(dueSoon?.status, "Due Soon");
  const upcoming = calculateTimelineAlert("2026-08-30", today);
  assert.equal(upcoming?.status, "Upcoming");
  const onTrack = calculateTimelineAlert("2026-09-20", today);
  assert.equal(onTrack?.status, "On Track");
});

test("team lead status thresholds", () => {
  assert.equal(teamLeadStatus(4), "Normal");
  assert.equal(teamLeadStatus(5), "Medium");
  assert.equal(teamLeadStatus(10), "High");
});

test("compact currency", () => {
  assert.equal(formatCurrencyCompact(0), "₹ 0");
  assert.equal(formatCurrencyCompact(150000), "₹ 1.50 L");
});

test("department completion average excludes cancelled projects", () => {
  // Case 1: Design Engineering Services scenario (0%, 40%, Cancelled 0% -> (0+40)/2 = 20%)
  const desProjects = [
    { projectStatus: "Ongoing", completion: 0 },
    { projectStatus: "Active", completion: 40 },
    { projectStatus: "Cancelled", completion: 0 },
  ];
  assert.equal(calculateDepartmentCompletion(desProjects), 20);

  // Case 2: All cancelled projects -> safe 0 (no NaN / division by zero)
  const allCancelled = [
    { projectStatus: "Cancelled", completion: 0 },
    { projectStatus: "Cancelled", completion: 50 },
  ];
  assert.equal(calculateDepartmentCompletion(allCancelled), 0);

  // Case 3: Empty project list -> 0
  assert.equal(calculateDepartmentCompletion([]), 0);
});
