import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addToCounts,
  cycleStatus,
  emptyCounts,
  groupInvoices,
  isRaisedStatus,
  mergeInvoiceEvents,
  normalizeInvoiceNo,
  parseMonth,
  paymentLabel,
  summarizeMonth,
  type StoredEvent,
  type TrackerLine,
} from "./invoiceTracker.rules.js";

const line = (id: string, projectId: string, invoiceNo: string, status: string, amount = 100): TrackerLine => ({ id, projectId, invoiceNo, status, invoiceAmountINR: amount });

test("parseMonth: real months give an exact [start, end) UTC window; anything else is rejected", () => {
  const w = parseMonth("2026-03")!;
  assert.equal(w.start.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(w.end.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(parseMonth("2026-12")!.end.toISOString(), "2027-01-01T00:00:00.000Z", "December rolls into the next year");
  assert.equal(parseMonth("2024-02")!.end.toISOString(), "2024-03-01T00:00:00.000Z", "leap-year February");
  for (const bad of ["2026-13", "2026-00", "2026-3", "26-03", "2026/03", "", "1999-12", "2101-01", "2026-03-01", " 2026-03"]) assert.equal(parseMonth(bad), null, bad);
  // The boundary rule: a date-only invoice date (UTC midnight) is in the window on its first day and out on the next month's first day.
  assert.ok(new Date("2026-03-01T00:00:00Z") >= w.start && new Date("2026-03-31T00:00:00Z") < w.end);
  assert.ok(!(new Date("2026-04-01T00:00:00Z") < w.end) && new Date("2026-02-28T00:00:00Z") < w.start);
});

test("raised statuses are Raised / PartiallyPaid / Paid only — never Draft or Cancelled", () => {
  for (const s of ["Raised", "PartiallyPaid", "Paid"]) assert.equal(isRaisedStatus(s), true, s);
  for (const s of ["Draft", "Cancelled", "Submitted", "", "paid"]) assert.equal(isRaisedStatus(s), false, s);
});

test("cycleStatus: the same cascade as the frontend's getInvoiceCycleStatus (mixed lines resolve deterministically)", () => {
  const cases: [string[], string][] = [
    [[], "Draft"],
    [["Draft"], "Draft"],
    [["Cancelled", "Cancelled"], "Cancelled"],
    [["Paid", "Paid"], "Paid"],
    [["Paid", "Cancelled"], "Paid"],
    [["Paid", "Raised"], "PartiallyPaid"],
    [["PartiallyPaid", "Raised"], "PartiallyPaid"],
    [["Raised", "Draft"], "Raised"],
    [["Raised", "Cancelled"], "Raised"],
    [["Draft", "Cancelled"], "Draft"],
  ];
  for (const [statuses, want] of cases) assert.equal(cycleStatus(statuses), want, statuses.join("+") || "(none)");
});

test("paymentLabel comes only from the stored status; Draft and Cancelled have none", () => {
  assert.deepEqual(["Raised", "PartiallyPaid", "Paid", "Draft", "Cancelled"].map(paymentLabel), ["Awaiting payment", "Partially paid", "Paid", "Not applicable", "Not applicable"]);
});

test("groupInvoices: one invoice per project + trimmed/case-insensitive number; the same number in two projects stays two invoices", () => {
  const groups = groupInvoices([
    line("1", "p1", "INV-1", "Raised", 100),
    line("2", "p1", " inv-1 ", "Raised", 200),
    line("3", "p1", "INV-2", "Cancelled", 999),
    line("4", "p2", "INV-1", "Draft", 50),
  ]);
  assert.equal(groups.length, 3);
  const inv1 = groups.find((g) => g.projectId === "p1" && g.key === "INV-1")!;
  assert.deepEqual([inv1.lines.length, inv1.amountINR, inv1.status], [2, 300, "Raised"]);
  assert.equal(groups.find((g) => g.key === "INV-2")!.amountINR, 0, "a cancelled line adds no amount");
  assert.equal(normalizeInvoiceNo("  abc-1 "), "ABC-1");
});

test("summarizeMonth: five invoices on one project are five invoices and one raised project; Draft/Cancelled never raise a project", () => {
  const lines = [
    ...[1, 2, 3, 4, 5].map((n) => line(`a${n}`, "p1", `A-${n}`, n === 5 ? "Paid" : "Raised", 100)),
    line("b1", "p2", "B-1", "Draft", 70),
    line("c1", "p3", "C-1", "Cancelled", 80),
    line("d1", "p4", "D-1", "PartiallyPaid", 25.5),
    line("d2", "p4", "D-1", "PartiallyPaid", 24.5), // two lines, one invoice
  ];
  const { summary, byProject } = summarizeMonth(lines, 6, 2);
  assert.equal(summary.invoiceCount, 8, "5 + 1 + 1 + 1 distinct invoices");
  assert.equal(summary.invoicesRaised, 6);
  assert.equal(summary.projectCount, 6);
  assert.equal(summary.projectsRaised, 2, "p1 and p4 only");
  assert.equal(summary.projectsNotRaised, 4);
  assert.equal(summary.raisedAmountINR, 550);
  assert.deepEqual(summary.byStatus, { raised: 4, partiallyPaid: 1, paid: 1, draft: 1, cancelled: 1 });
  assert.equal(summary.approvalPendingCount, 2);
  assert.deepEqual([byProject.get("p1")!.state, byProject.get("p1")!.raisedInvoiceCount, byProject.get("p1")!.invoiceCount], ["Raised", 5, 5]);
  assert.deepEqual([byProject.get("p2")!.state, byProject.get("p2")!.draftInvoiceCount], ["Not Raised", 1]);
  assert.deepEqual([byProject.get("p3")!.state, byProject.get("p3")!.cancelledInvoiceCount], ["Not Raised", 1]);
  assert.equal(byProject.has("p5"), false, "a project with no invoices has no entry (the API shows Not Raised)");
  const counts = emptyCounts();
  addToCounts(counts, "Raised");
  addToCounts(counts, "Draft");
  assert.deepEqual(counts, { raised: 1, partiallyPaid: 0, paid: 0, draft: 1, cancelled: 0 });
});

const ev = (n: number, over: Partial<StoredEvent> = {}): StoredEvent => ({
  id: `e${n}`, seq: BigInt(n), invoiceLineId: `l${(over.invoiceLineId ?? "1")}`, eventType: "STATUS_CHANGED", fromStatus: "Raised", toStatus: "Paid",
  actorUserId: "u1", actorName: "Asha", source: "invoice_update", occurredAt: new Date(Date.UTC(2026, 9, 20, 10, 0, n)), ...over,
});

test("mergeInvoiceEvents: one action on an N-line invoice shows once; different actor, change or a later time stays separate; order is chronological", () => {
  const merged = mergeInvoiceEvents([
    ev(3, { invoiceLineId: "2" }),
    ev(1, { invoiceLineId: "1" }),
    ev(2, { invoiceLineId: "3" }),
    ev(4, { actorUserId: "u2", actorName: "Ravi", toStatus: "Cancelled" }),
    ev(5, { occurredAt: new Date(Date.UTC(2026, 9, 20, 10, 30, 0)) }),
  ]);
  assert.equal(merged.length, 3);
  assert.deepEqual([merged[0]!.lineCount, merged[0]!.actorName, merged[0]!.toStatus], [3, "Asha", "Paid"]);
  assert.deepEqual([merged[1]!.actorName, merged[1]!.toStatus], ["Ravi", "Cancelled"]);
  assert.equal(merged[2]!.occurredAt, "2026-10-20T10:30:00.000Z", "the same change by the same person half an hour later is a separate event");
  assert.deepEqual(mergeInvoiceEvents([]), []);
});
