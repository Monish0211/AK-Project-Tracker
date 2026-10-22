import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_MONTHS,
  cycleStatus,
  financialsOf,
  hasMixedLiveStatuses,
  firstRaisedAt,
  groupInvoices,
  inWindow,
  invoiceTier,
  orderRecords,
  requestTier,
  inInvoiceMonth,
  invoicesDatedIn,
  isValidInvoiceDate,
  bestRecord,
  isRaisedStatus,
  istMonthOf,
  mergeInvoiceEvents,
  normalizeStatus,
  parseMonth,
  paymentLabel,
  summarizeOutstanding,
  summarizeRecords,
  compareNewestFirst,
  invoicesUpTo,
  latestRaisedGroup,
  olderOutstanding,
  type StoredEvent,
  type TrackerLine,
} from "./invoiceTracker.rules.js";
import { calendarDaysSince, daysFrom, zonedToday } from "../weeklyNotifications/unpaidInvoice.rules.js";

const at = (iso: string) => new Date(iso);
const line = (id: string, projectId: string, invoiceNo: string, status: string, amount: number, createdAt: string, invoiceDate = "2026-03-01"): TrackerLine => ({
  id, projectId, invoiceNo, status, invoiceAmountINR: amount, createdAt: at(createdAt), invoiceDate: at(`${invoiceDate}T00:00:00Z`),
});

test("a month has two windows: invoice dates use the UTC calendar month (date-only values); recorded times use the India month", () => {
  const w = parseMonth("2026-03")!;
  assert.equal(w.dateStart.toISOString(), "2026-03-01T00:00:00.000Z", "invoice dates: 1 March (inclusive start)");
  assert.equal(w.dateEnd.toISOString(), "2026-04-01T00:00:00.000Z", "invoice dates: 1 April (exclusive end)");
  assert.equal(parseMonth("2026-12")!.dateEnd.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(w.start.toISOString(), "2026-02-28T18:30:00.000Z", "1 Mar 00:00 IST");
  assert.equal(w.end.toISOString(), "2026-03-31T18:30:00.000Z", "1 Apr 00:00 IST");
  assert.equal(parseMonth("2026-12")!.end.toISOString(), "2026-12-31T18:30:00.000Z");
  for (const bad of ["2026-13", "2026-00", "2026-3", "", "1999-12", "2101-01", "2026-03-01", "all"]) assert.equal(parseMonth(bad), null, bad);
  assert.equal(ALL_MONTHS, "all");
});

test("the exact IST boundaries: the last second of February is February, the next instant is March", () => {
  assert.equal(istMonthOf(at("2026-02-28T18:29:59.999Z")), "2026-02");
  assert.equal(istMonthOf(at("2026-02-28T18:30:00.000Z")), "2026-03");
  assert.equal(istMonthOf(at("2026-03-31T18:29:59.999Z")), "2026-03");
  assert.equal(istMonthOf(at("2026-03-31T18:30:00.000Z")), "2026-04");
  assert.equal(istMonthOf(at("2026-12-31T18:30:00.000Z")), "2027-01", "year roll-over");
  const march = parseMonth("2026-03");
  assert.equal(inWindow(at("2026-02-28T18:30:00Z"), march), true);
  assert.equal(inWindow(at("2026-03-31T18:30:00Z"), march), false, "the end is exclusive");
  assert.equal(inWindow(at("1999-01-01T00:00:00Z"), null), true, "null window = every month");
});

test("statuses: only the stored ones; a legacy 'Submitted' is Raised everywhere", () => {
  assert.equal(normalizeStatus("Submitted"), "Raised");
  for (const s of ["Draft", "Raised", "PartiallyPaid", "Paid", "Cancelled"]) assert.equal(normalizeStatus(s), s);
  assert.equal(isRaisedStatus("Submitted"), true);
  assert.equal(isRaisedStatus("Draft"), false);
  assert.equal(isRaisedStatus("Cancelled"), false);
  assert.equal(cycleStatus(["Submitted"]), "Raised");
  assert.equal(cycleStatus(["Cancelled", "Cancelled"]), "Cancelled");
  assert.equal(cycleStatus(["Paid", "Cancelled"]), "Paid");
  assert.equal(cycleStatus(["Paid", "Raised"]), "PartiallyPaid");
  assert.equal(cycleStatus(["Draft", "Raised"]), "Raised");
  assert.equal(cycleStatus([]), "Draft");
  assert.equal(paymentLabel("Submitted"), "Awaiting payment");
  assert.equal(paymentLabel("Draft"), "Not applicable");
});

test("membership is by INVOICE DATE: inclusive start, exclusive next-month start; creation and raise dates play no part", () => {
  const oct = parseMonth("2026-10")!;
  const d = (iso: string) => at(`${iso}T00:00:00Z`);
  assert.equal(inInvoiceMonth(d("2026-10-01"), oct), true, "first day");
  assert.equal(inInvoiceMonth(d("2026-10-15"), oct), true);
  assert.equal(inInvoiceMonth(d("2026-10-31"), oct), true, "last day");
  assert.equal(inInvoiceMonth(d("2026-09-30"), oct), false, "the day before");
  assert.equal(inInvoiceMonth(d("2026-11-01"), oct), false, "the day after");
  assert.equal(inInvoiceMonth(d("2026-01-15"), oct), false, "January is not October");
  assert.equal(inInvoiceMonth(d("2026-11-05"), oct), false, "November is not October");
  assert.equal(inInvoiceMonth(d("2026-01-15"), null), true, "all months: any usable date");
  const groups = groupInvoices([
    line("a", "p1", "JAN", "Raised", 800, "2026-10-10T06:00:00Z", "2026-01-15"), // created (and raised) in October, dated January
    line("b", "p1", "OCT", "Draft", 100, "2026-01-02T06:00:00Z", "2026-10-25"), // created in January, dated October
    line("c", "p1", "NOV", "Raised", 900, "2026-10-20T06:00:00Z", "2026-11-05"),
  ]);
  assert.deepEqual(invoicesDatedIn(groups, oct).map((g) => g.key), ["OCT"], "only the invoice DATED in October — a Draft qualifies, the January and November ones do not");
  assert.equal(invoicesDatedIn(groups, null).length, 3);
});

test("an invoice's date is its EARLIEST usable line date (one invoice, one month); an unusable date puts it in no month — creation date is never substituted", () => {
  const groups = groupInvoices([
    line("a", "p1", "LATE", "Raised", 900, "2026-09-28T06:00:00Z", "2026-09-28"),
    line("b", "p1", "late ", "Raised", 100, "2026-10-05T06:00:00Z", "2026-10-05"), // same invoice (trimmed, case-insensitive)
    line("c", "p1", "BAD", "Raised", 77, "2026-10-10T06:00:00Z", "1850-06-01"),
    { id: "d", projectId: "p1", invoiceNo: "NONE", status: "Raised", invoiceAmountINR: 5, createdAt: at("2026-10-11T06:00:00Z") }, // no invoice date at all
    { id: "e", projectId: "p1", invoiceNo: "NAN", status: "Raised", invoiceAmountINR: 5, createdAt: at("2026-10-11T06:00:00Z"), invoiceDate: new Date("not a date") },
  ]);
  const late = groups.find((g) => g.key === "LATE")!;
  assert.equal(late.invoiceDate!.toISOString(), "2026-09-28T00:00:00.000Z");
  assert.equal(late.amountINR, 1000);
  assert.deepEqual(invoicesDatedIn(groups, parseMonth("2026-10")).map((g) => g.key), [], "the line dated 5 Oct does not pull LATE into October");
  assert.deepEqual(invoicesDatedIn(groups, parseMonth("2026-09")).map((g) => g.key), ["LATE"]);
  for (const key of ["BAD", "NONE", "NAN"]) {
    const g = groups.find((x) => x.key === key)!;
    assert.equal(g.invoiceDate, null, `${key}: no usable invoice date`);
    assert.equal(inInvoiceMonth(g.invoiceDate, parseMonth("2026-10")), false, `${key} is NOT an October invoice although it was created in October`);
  }
  assert.equal(invoicesDatedIn(groups, null).length, 4, "all history still lists it");
  assert.deepEqual(
    [isValidInvoiceDate(null), isValidInvoiceDate(undefined), isValidInvoiceDate(new Date("x")), isValidInvoiceDate(at("1850-01-01T00:00:00Z")), isValidInvoiceDate(at("2026-10-15T00:00:00Z")), isValidInvoiceDate(at("2201-01-01T00:00:00Z"))],
    [false, false, false, false, true, false]
  );
});

test("financials come from the saved status only: Raised owes in full, Paid is settled (amount INFERRED, labelled), a Partially Paid balance is 'not recorded'", () => {
  assert.deepEqual(financialsOf("Raised", 1000), { amountINR: 1000, amountPaidINR: 0, paidBasis: "none_yet", outstandingINR: 1000, balance: "full", flags: [] });
  assert.deepEqual(financialsOf("Submitted", 400), { amountINR: 400, amountPaidINR: 0, paidBasis: "none_yet", outstandingINR: 400, balance: "full", flags: [] });
  assert.deepEqual(financialsOf("Paid", 3000), { amountINR: 3000, amountPaidINR: 3000, paidBasis: "inferred_from_status", outstandingINR: 0, balance: "settled", flags: [] }, "Paid with nothing outstanding: settled at the invoice amount — inferred from the status, never a recorded payment");
  const partial = financialsOf("PartiallyPaid", 2000);
  assert.deepEqual([partial.amountPaidINR, partial.outstandingINR, partial.balance], [null, null, "not_recorded"]);
  assert.match(partial.flags.join(" "), /not recorded/i);
  for (const s of ["Draft", "Cancelled"]) assert.deepEqual([financialsOf(s, 500).outstandingINR, financialsOf(s, 500).balance], [null, "not_applicable"]);
  assert.match(financialsOf("Raised", 0).flags.join(" "), /zero amount/i, "inconsistent data is flagged, not silently fixed");
  assert.match(financialsOf("Raised", 10, true).flags.join(" "), /different statuses/i);
});

test("month summary: Draft and Cancelled never count as raised, requests are counted separately, pending approval is a count only", () => {
  const groups = groupInvoices([
    line("1", "p1", "D", "Draft", 100, "2026-03-05T00:00:00Z"),
    line("2", "p1", "R", "Raised", 1000, "2026-03-06T00:00:00Z"),
    line("3", "p1", "PP", "PartiallyPaid", 2000, "2026-03-07T00:00:00Z"),
    line("4", "p1", "P", "Paid", 3000, "2026-03-08T00:00:00Z"),
    line("5", "p1", "C", "Cancelled", 500, "2026-03-09T00:00:00Z"),
    line("6", "p2", "S", "Submitted", 400, "2026-03-10T00:00:00Z"),
    line("7", "p3", "ONLY-DRAFT", "Draft", 10, "2026-03-10T00:00:00Z"),
  ]);
  const requests = [
    { id: "r1", projectId: "p4", status: "Open", createdAt: at("2026-03-02T00:00:00Z") },
    { id: "r2", projectId: "p1", status: "Completed", createdAt: at("2026-03-03T00:00:00Z") },
  ];
  const { summary, byProject } = summarizeRecords(groups, requests);
  assert.equal(summary.invoiceCount, 7);
  assert.equal(summary.requestCount, 2);
  assert.equal(summary.recordCount, 9);
  assert.deepEqual(summary.byStatus, { raised: 2, partiallyPaid: 1, paid: 1, draft: 2, cancelled: 1 });
  assert.equal(summary.invoicesRaised, 4, "Raised, PartiallyPaid, Paid, and the legacy Submitted");
  assert.equal(summary.raisedAmountINR, 6400, "1000 + 2000 + 3000 + 400 — never Draft, never Cancelled, never a request");
  assert.deepEqual(summary.requests, { open: 1, completed: 1 });
  assert.deepEqual(summary.pendingApproval, { count: 1, amountINR: null, note: summary.pendingApproval.note });
  assert.deepEqual(
    [summary.collected.amountINR, summary.collected.basis, summary.collected.paidInvoiceCount, summary.collected.partiallyPaidExcludedCount, summary.collected.needsReviewCount],
    [3000, "inferred_from_paid_status", 1, 1, 0],
    "only the Paid invoice (at its full amount); the Partially Paid one is excluded, not guessed"
  );
  assert.deepEqual(summary.outstanding, { scope: "selected_month", knownAmountINR: 1400, invoiceCount: 3, balanceNotRecordedCount: 1 });
  assert.equal(summary.projectCount, 4, "p1, p2, p3 (invoices) and p4 (a request only)");
  assert.equal(summary.projectsRaised, 2);
  assert.equal(summary.projectsAwaitingApproval, 1);
  assert.deepEqual(byProject.get("p1")!.byStatus, { raised: 1, partiallyPaid: 1, paid: 1, draft: 1, cancelled: 1 }, "every actual status is kept, not collapsed into one label");
  assert.deepEqual(byProject.get("p2")!.byStatus, { raised: 1, partiallyPaid: 0, paid: 0, draft: 0, cancelled: 0 }, "the legacy 'Submitted' counts as Raised");
  assert.deepEqual(byProject.get("p3")!.byStatus, { raised: 0, partiallyPaid: 0, paid: 0, draft: 1, cancelled: 0 }, "a Draft never makes a project Raised");
  assert.equal(byProject.get("p3")!.raisedInvoiceCount, 0);
  assert.deepEqual([byProject.get("p4")!.invoiceCount, byProject.get("p4")!.openRequestCount, byProject.get("p4")!.raisedInvoiceCount], [0, 1, 0], "an open request alone is not an invoice");
  assert.equal("state" in byProject.get("p1")!, false);
  assert.equal(byProject.get("p1")!.completedRequestCount, 1);
});

test("one underlying invoice is never double counted: many lines are one invoice and a request is a separate record", () => {
  const groups = groupInvoices([line("a", "p1", "X", "Raised", 100, "2026-03-01T00:00:00Z"), line("b", "p1", "x", "Raised", 200, "2026-03-01T00:00:00Z"), line("c", "p1", "X ", "Raised", 300, "2026-03-02T00:00:00Z")]);
  const { summary } = summarizeRecords(groups, [{ id: "r", projectId: "p1", status: "Completed", createdAt: at("2026-03-01T00:00:00Z") }]);
  assert.equal(summary.invoiceCount, 1);
  assert.equal(summary.raisedAmountINR, 600);
  assert.equal(summary.recordCount, 2);
});

test("outstanding totals: known balance only for Raised; Partially Paid is counted, never turned into money", () => {
  const t = summarizeOutstanding([
    { status: "Raised", amountINR: 1000, daysOutstanding: 40 },
    { status: "Submitted", amountINR: 400, daysOutstanding: 5 },
    { status: "PartiallyPaid", amountINR: 2000, daysOutstanding: 90 },
    { status: "Raised", amountINR: 50, daysOutstanding: null },
  ]);
  assert.deepEqual(t, { invoiceCount: 4, knownOutstandingINR: 1450, partiallyPaidCount: 1, partiallyPaidInvoiceAmountINR: 2000, overdue30PlusCount: 2, oldestDays: 90 });
  assert.deepEqual(summarizeOutstanding([]), { invoiceCount: 0, knownOutstandingINR: 0, partiallyPaidCount: 0, partiallyPaidInvoiceAmountINR: 0, overdue30PlusCount: 0, oldestDays: null });
});

const ev = (n: number, from: string | null, to: string | null, iso: string, actor = "Asha", id = "u1", type = "STATUS_CHANGED", lineId = "l1"): StoredEvent => ({
  id: `e${n}`, seq: BigInt(n), invoiceLineId: lineId, eventType: type, fromStatus: from, toStatus: to, actorUserId: id, actorName: actor, source: "invoice_update", occurredAt: at(iso),
});

test("history: one action across several lines is one entry; the raised date is only what history recorded", () => {
  const merged = mergeInvoiceEvents([
    ev(1, null, "Raised", "2026-03-06T05:00:00Z", "Asha", "u1", "CREATED", "l1"),
    ev(2, null, "Raised", "2026-03-06T05:00:01Z", "Asha", "u1", "CREATED", "l2"),
    ev(3, "Raised", "Paid", "2026-04-02T05:00:00Z"),
  ]);
  assert.deepEqual(merged.map((e) => [e.eventType, e.fromStatus, e.toStatus, e.lineCount]), [["CREATED", null, "Raised", 2], ["STATUS_CHANGED", "Raised", "Paid", 1]]);
  assert.equal(firstRaisedAt(merged), "2026-03-06T05:00:00.000Z");
  assert.equal(firstRaisedAt([]), null, "no history -> no raised date is invented");
  assert.equal(firstRaisedAt(mergeInvoiceEvents([ev(9, null, "Draft", "2026-03-01T00:00:00Z", "Asha", "u1", "CREATED")])), null, "a Draft event is not a raise");
});

test("the raised date is the moment it BECAME raised — a later payment is never mistaken for it", () => {
  const t = (events: StoredEvent[]) => firstRaisedAt(mergeInvoiceEvents(events));
  assert.equal(t([ev(1, "Raised", "Paid", "2026-10-21T13:00:00Z")]), null, "history holds only the payment (the invoice predates tracking): no raise date");
  assert.equal(t([ev(1, "Raised", "PartiallyPaid", "2026-04-01T00:00:00Z"), ev(2, "PartiallyPaid", "Paid", "2026-05-01T00:00:00Z")]), null);
  assert.equal(t([ev(1, "Draft", "Raised", "2026-03-06T00:00:00Z"), ev(2, "Raised", "Paid", "2026-04-02T00:00:00Z")]), "2026-03-06T00:00:00.000Z", "Draft -> Raised is the raise");
  assert.equal(t([ev(1, null, "Paid", "2026-03-06T00:00:00Z", "Asha", "u1", "CREATED")]), "2026-03-06T00:00:00.000Z", "created already Paid: it was raised when recorded");
  assert.equal(t([ev(1, "Raised", "Cancelled", "2026-03-07T00:00:00Z"), ev(2, "Cancelled", "Raised", "2026-03-08T00:00:00Z")]), "2026-03-08T00:00:00.000Z", "a re-raise after Cancelled");
  assert.equal(t([ev(1, "Draft", "Cancelled", "2026-03-07T00:00:00Z")]), null);
});

test("two groups: GROUP 1 = raised in the selected month (recorded raise, India time); everything else is GROUP 2 — a Draft, Cancelled or request is never raised", () => {
  const oct = parseMonth("2026-10");
  const inv = (status: string, raisedAt: string | null) => ({ status, raisedAt: raisedAt ? at(raisedAt) : null });
  assert.equal(invoiceTier(inv("Raised", "2026-10-10T00:00:00Z"), oct), 1);
  assert.equal(invoiceTier(inv("Paid", "2026-10-31T18:29:59Z"), oct), 1, "23:59:59 IST on 31 October");
  assert.equal(invoiceTier(inv("Paid", "2026-10-31T18:30:00Z"), oct), 2, "00:00:00 IST on 1 November");
  assert.equal(invoiceTier(inv("Raised", "2026-09-25T00:00:00Z"), oct), 2, "raised in September");
  assert.equal(invoiceTier(inv("Raised", null), oct), 2, "no recorded raise: never assumed");
  assert.equal(invoiceTier(inv("Submitted", "2026-10-05T00:00:00Z"), oct), 1, "legacy Submitted is Raised");
  assert.equal(invoiceTier(inv("Draft", "2026-10-10T00:00:00Z"), oct), 2, "a Draft is never a raise");
  assert.equal(invoiceTier(inv("Cancelled", "2026-10-10T00:00:00Z"), oct), 2);
  assert.equal(invoiceTier(inv("Raised", "2026-10-10T00:00:00Z"), null), 2, "all months: no raised-in-the-period group");
  assert.equal(requestTier(), 2);
});

test("orderRecords: group 1 first, newest relevant date first inside a group, equal dates: invoices before requests, then a stable id tie-break; the input order never matters", () => {
  const rec = (kind: "invoice" | "request", id: string, tier: 1 | 2, sortDate: string) => ({ kind, id, tier, sortDate: at(sortDate) });
  const input = [
    rec("invoice", "draft", 2, "2026-10-25T00:00:00Z"),
    rec("invoice", "raised-sep", 2, "2026-10-10T00:00:00Z"),
    rec("request", "open-request", 2, "2026-10-03T00:00:00Z"),
    rec("invoice", "raised-early", 1, "2026-10-03T06:00:00Z"),
    rec("invoice", "raised-late", 1, "2026-10-16T06:00:00Z"),
    rec("invoice", "b-tie", 2, "2026-10-12T00:00:00Z"),
    rec("invoice", "a-tie", 2, "2026-10-12T00:00:00Z"),
    rec("request", "a-tie", 2, "2026-10-12T00:00:00Z"),
  ];
  const order = orderRecords(input);
  assert.deepEqual(order.map((o) => `${o.kind}:${o.id}`), ["invoice:raised-late", "invoice:raised-early", "invoice:draft", "invoice:a-tie", "invoice:b-tie", "request:a-tie", "invoice:raised-sep", "request:open-request"]);
  assert.deepEqual(orderRecords([...input].reverse()), order);
  assert.deepEqual(bestRecord(input), { tier: 1, sortDate: at("2026-10-16T06:00:00Z") }, "a project is represented by its best record");
  assert.deepEqual(bestRecord(input.filter((r) => r.tier === 2)), { tier: 2, sortDate: at("2026-10-25T00:00:00Z") });
  assert.equal(bestRecord([]), null);
});

test("Paid with zero outstanding: Amount Paid = the invoice amount, labelled as inferred from the Paid status; paid + outstanding always equals the invoice amount", () => {
  const paid = financialsOf("Paid", 333000);
  assert.deepEqual([paid.amountPaidINR, paid.outstandingINR, paid.paidBasis, paid.balance], [333000, 0, "inferred_from_status", "settled"]);
  assert.deepEqual(paid.flags, []);
  for (const [status, amount] of [["Raised", 1000], ["Paid", 250.5], ["Submitted", 40]] as const) {
    const f = financialsOf(status, amount);
    assert.equal(f.amountPaidINR! + f.outstandingINR!, amount, `${status}: paid + outstanding = invoice amount`);
  }
  for (const status of ["PartiallyPaid", "Draft", "Cancelled"]) {
    const f = financialsOf(status, 500);
    assert.ok(f.amountPaidINR === null || f.outstandingINR === null, `${status}: never both numbers invented`);
  }
});

test("Paid whose data contradicts 'settled' (negative / invalid amount, live lines with different statuses) is NOT inferred — the amount is not recorded and it is flagged", () => {
  for (const amount of [-50, Number.NaN, Number.POSITIVE_INFINITY]) {
    const f = financialsOf("Paid", amount);
    assert.deepEqual([f.amountPaidINR, f.outstandingINR, f.paidBasis, f.balance], [null, null, "not_recorded", "not_recorded"], `amount ${amount}`);
    assert.match(f.flags.join(" "), /settlement cannot be confirmed \(the invoice amount is negative or invalid\)/);
  }
  const zero = financialsOf("Paid", 0);
  assert.deepEqual([zero.amountPaidINR, zero.outstandingINR, zero.paidBasis, zero.balance], [0, 0, "inferred_from_status", "settled"], "a zero-amount Paid invoice is settled at 0 — nothing contradicts Paid");
  assert.deepEqual(zero.flags, ["Paid invoice has a zero amount — review"], "…but it is flagged because a zero invoice is unusual");
  const mixed = financialsOf("Paid", 900, false, true);
  assert.deepEqual([mixed.amountPaidINR, mixed.outstandingINR, mixed.paidBasis], [null, null, "not_recorded"]);
  assert.match(mixed.flags.join(" "), /its lines have different statuses/);
  assert.equal(hasMixedLiveStatuses([{ status: "Paid" }, { status: "Paid" }, { status: "Cancelled" }]), false, "a Cancelled line does not contradict Paid");
  assert.equal(hasMixedLiveStatuses([{ status: "Paid" }, { status: "Raised" }]), true);
  assert.equal(hasMixedLiveStatuses([{ status: "Submitted" }, { status: "Raised" }]), false, "legacy Submitted is Raised");
});

test("Partially Paid with no payment data: the paid amount and the balance stay 'not recorded' — never guessed", () => {
  const f = financialsOf("PartiallyPaid", 2000);
  assert.deepEqual([f.amountPaidINR, f.outstandingINR, f.paidBasis, f.balance], [null, null, "not_recorded", "not_recorded"]);
  assert.match(f.flags.join(" "), /Paid amount and balance are not recorded/);
});

test("Amount collected: one defined rule, each invoice once — Paid at full amount only; Partially Paid and contradicted Paid are counted separately, never summed", () => {
  const groups = groupInvoices([
    line("1", "p1", "OK", "Paid", 400, "2026-12-01T00:00:00Z"),
    line("2", "p1", "MULTI", "Paid", 100, "2026-12-01T00:00:00Z"), // one invoice, two lines: counted ONCE
    line("3", "p1", "multi", "Paid", 200, "2026-12-02T00:00:00Z"),
    line("4", "p2", "ZERO", "Paid", 0, "2026-12-03T00:00:00Z"), // marked Paid, amount 0 -> settled at 0 (flagged on the invoice), counted in the collected total as 0
    line("5", "p2", "PART", "PartiallyPaid", 900, "2026-12-04T00:00:00Z"),
    line("6", "p2", "RAISED", "Raised", 50, "2026-12-05T00:00:00Z"),
    line("7", "p3", "DRAFT", "Draft", 70, "2026-12-06T00:00:00Z"),
    line("8", "p3", "CANC", "Cancelled", 80, "2026-12-07T00:00:00Z"),
    line("9", "p3", "OKCANC", "Paid", 60, "2026-12-08T00:00:00Z"),
    line("10", "p3", "okcanc", "Cancelled", 999, "2026-12-08T00:00:00Z"), // a Cancelled line of a Paid invoice: excluded from the amount, not a contradiction
  ]);
  const { summary } = summarizeRecords(groups, []);
  assert.deepEqual(summary.collected, {
    amountINR: 760, basis: "inferred_from_paid_status", paidInvoiceCount: 4, partiallyPaidExcludedCount: 1, needsReviewCount: 0, note: summary.collected.note,
  }, "400 + 300 (multi-line invoice once) + 0 (zero invoice) + 60 (cancelled line excluded) = 760 over 4 Paid invoices");
  const bad = summarizeRecords(groupInvoices([line("b1", "p9", "NEG", "Paid", -5, "2026-12-01T00:00:00Z"), line("b2", "p9", "OK2", "Paid", 10, "2026-12-01T00:00:00Z")]), []).summary.collected;
  assert.deepEqual([bad.amountINR, bad.paidInvoiceCount, bad.needsReviewCount], [10, 1, 1], "a Paid invoice the data contradicts (negative amount) is not summed — it is counted for review");
  assert.match(summary.collected.note, /inferred from the Paid status, not from a recorded payment/);
  assert.equal(summary.collected.amountINR + 0 <= summary.raisedAmountINR, true, "never more than the raised amount");
});

test("guard: the schema stores NO payment amount or transaction for invoices — if this fails, the Amount Paid rule must be revisited", async () => {
  const { readFileSync } = await import("node:fs");
  const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const block = (name: string) => new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1]!;
  const columns = (name: string) => block(name).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//") && !l.startsWith("@@")).map((l) => l.split(/\s+/)[0]!);
  const paymentLike = /paid|payment|receipt|collect|settle|refund|tds|balance|received|transaction|cheque|utr/i;
  for (const model of ["InvoiceLine", "InvoiceNumber", "InvoiceRequest", "InvoiceStatusEvent"]) {
    assert.deepEqual(columns(model).filter((c) => paymentLike.test(c)), [], `${model} has a payment-like column`);
  }
  assert.deepEqual(columns("PaymentMilestone"), ["id", "projectId", "project", "milestoneName", "paymentPercentage", "dueDate", "createdAt", "updatedAt"], "PaymentMilestone is the billing PLAN (name, percentage, due date), not a receipt");
  const models = [...schema.matchAll(/\nmodel (\w+) \{/g)].map((m) => m[1]!);
  assert.deepEqual(models.filter((m) => /receipt|collect|transaction|ledger|settle|refund/i.test(m)), [], "no payment / receipt / transaction table exists");
  assert.ok(columns("InvoiceLine").includes("status") && columns("InvoiceLine").includes("invoiceAmountINR"), "the invoice has a status and an amount — that is all it records about settlement");
});

test("headline rules: latest raised by invoice date; Draft / Cancelled never; undated never; older outstanding counts each invoice once and withholds an unreliable total", () => {
  const g = (rows: TrackerLine[]) => groupInvoices(rows);
  const groups = g([
    line("1", "p", "NEWDRAFT", "Draft", 5, "2026-03-01T06:00:00Z", "2026-03-30"),
    line("2", "p", "NEWCANC", "Cancelled", 5, "2026-03-01T06:00:00Z", "2026-03-29"),
    line("3", "p", "LATEST", "Paid", 450, "2026-01-01T06:00:00Z", "2026-03-20"),
    line("4", "p", "OLD1", "Raised", 120, "2026-03-25T06:00:00Z", "2026-02-05"),
    line("5", "p", "OLD2", "PartiallyPaid", 90, "2026-02-01T06:00:00Z", "2026-01-05"),
    line("6", "p", "OLD3", "Paid", 70, "2026-01-01T06:00:00Z", "2025-12-05"),
    line("7", "p", "OLD4", "Cancelled", 60, "2026-01-01T06:00:00Z", "2025-12-01"),
    line("8", "p", "OLD5", "Raised", 0, "2026-01-01T06:00:00Z", "2025-11-01"), // zero amount: counted, but its balance is not reliable
    line("9", "p", "FUTURE", "Raised", 999, "2026-04-02T06:00:00Z", "2026-04-02"),
    { ...line("10", "p", "NODATE", "Raised", 77, "2026-03-01T06:00:00Z"), invoiceDate: new Date("1850-06-01T00:00:00Z") },
    line("11", "p", "DUP", "Raised", 10, "2026-01-01T06:00:00Z", "2025-10-01"),
    line("12", "p", "DUP", "Raised", 15, "2026-01-01T06:00:00Z", "2025-10-02"), // a second line of the same invoice — one invoice, 25
  ]);
  const window = parseMonth("2026-03")!;
  const context = invoicesUpTo(groups, window);
  assert.deepEqual(context.map((x) => x.invoiceNo).sort(), ["DUP", "LATEST", "NEWCANC", "NEWDRAFT", "OLD1", "OLD2", "OLD3", "OLD4", "OLD5"], "after the month's end and undated invoices are outside the context");
  const latest = latestRaisedGroup(context)!;
  assert.equal(latest.invoiceNo, "LATEST", "newest raised invoice by invoice date — Paid is fine, newer Draft / Cancelled are not eligible");
  const older = olderOutstanding(context, latest, groups);
  assert.deepEqual([older.count, older.unknownCount, older.knownAmountINR, older.amountINR, older.undatedCount], [4, 2, 145, null, 1], "OLD1 120 + DUP 25 reliable; OLD2 (Partially Paid) and OLD5 (zero) unknown → no total; NODATE only counted apart");
  assert.deepEqual(older.keys.sort(), ["DUP", "OLD1", "OLD2", "OLD5"], "each invoice once; Paid, Cancelled, Draft and the latest never");
  const reliable = olderOutstanding(context.filter((x) => !["OLD2", "OLD5"].includes(x.invoiceNo)), latest, []);
  assert.deepEqual([reliable.count, reliable.amountINR], [2, 145], "every balance reliable → a total is given");
  assert.deepEqual(olderOutstanding([], null, []), { count: 0, amountINR: 0, knownAmountINR: 0, unknownCount: 0, undatedCount: 0, keys: [] });
  // All history (no window): every usable-dated invoice, the future included
  assert.equal(latestRaisedGroup(invoicesUpTo(groups, null))!.invoiceNo, "FUTURE");
  // tie-break: equal dates → later creation, then the greater key; antisymmetric and stable
  const a = { invoiceDate: new Date("2026-03-01"), createdAt: new Date("2026-03-01T06:00:00Z"), key: "a" };
  const b = { invoiceDate: new Date("2026-03-01"), createdAt: new Date("2026-03-02T06:00:00Z"), key: "b" };
  const c = { ...b, key: "c" };
  assert.ok(compareNewestFirst(b, a) < 0 && compareNewestFirst(a, b) > 0, "same date: the later-created invoice is newer");
  assert.ok(compareNewestFirst(c, b) < 0 && compareNewestFirst(b, c) > 0, "same date and creation: the greater key is newer");
  assert.equal(compareNewestFirst(a, { ...a }), 0);
});

test("Outstanding days: formatting today once per request gives exactly the per-row result (including the India day boundary), so the endpoint no longer builds a date formatter per invoice", () => {
  const tz = "Asia/Kolkata";
  for (const nowIso of ["2026-10-21T10:00:00Z", "2026-10-21T18:29:59Z", "2026-10-21T18:30:00Z", "2026-12-31T20:00:00Z"]) {
    const now = new Date(nowIso);
    const today = zonedToday(now, tz);
    for (const day of ["2026-10-21", "2026-10-22", "2026-10-01", "2026-09-18", "2025-12-31", "1900-01-01"]) {
      const d = new Date(`${day}T00:00:00Z`);
      assert.equal(daysFrom(d, today), calendarDaysSince(d, now, tz), `${day} as of ${nowIso}`);
    }
  }
  assert.equal(zonedToday(new Date("2026-10-21T18:29:59Z"), tz), "2026-10-21", "23:59:59 IST is still the 21st");
  assert.equal(zonedToday(new Date("2026-10-21T18:30:00Z"), tz), "2026-10-22", "00:00:00 IST is the 22nd");
});
