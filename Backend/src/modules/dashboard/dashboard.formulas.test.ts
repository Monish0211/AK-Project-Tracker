import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateTimelineAlert,
  dashboardOutstanding,
  formatCurrencyCompact,
  invoiceRaisedFromLines,
  paymentReceivedFromLines,
  profitPercentage,
  projectCommercialTotals,
  teamLeadStatus,
} from "./dashboard.formulas.js";

test("invoice raised excludes Cancelled and includes Draft", () => {
  const raised = invoiceRaisedFromLines([
    { status: "Draft", invoiceAmountINR: 3000 },
    { status: "Raised", invoiceAmountINR: 2000 },
    { status: "Cancelled", invoiceAmountINR: 9999 },
  ]);
  assert.equal(raised, 5000);
});

test("payment received is Raised/PartiallyPaid/Paid only", () => {
  const received = paymentReceivedFromLines([
    { status: "Draft", invoiceAmountINR: 3000 },
    { status: "Raised", invoiceAmountINR: 2000 },
    { status: "Paid", invoiceAmountINR: 1000 },
    { status: "Cancelled", invoiceAmountINR: 50 },
  ]);
  assert.equal(received, 3000);
});

test("per-project commercial caps raised at WO value", () => {
  const { totalInvoiceRaised, totalPaymentReceived } = projectCommercialTotals(4000, [
    { status: "Raised", invoiceAmountINR: 5000 },
  ]);
  assert.equal(totalInvoiceRaised, 4000);
  assert.equal(totalPaymentReceived, 4000);
});

test("dashboard outstanding is WO minus payment received", () => {
  assert.equal(dashboardOutstanding(100, 40), 60);
  assert.equal(dashboardOutstanding(100, 140), 0);
});

test("profit % matches getDashboardMetrics", () => {
  assert.equal(profitPercentage(0, 10), 0);
  assert.equal(profitPercentage(200, 50), 25);
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
