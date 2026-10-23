import assert from "node:assert/strict";
import { test } from "node:test";
import { groupInvoices, istDayOf, orderAllRecords, parseMonth, selectLatestRecord, shortRequestRef, type SummaryRequest, type TrackerLine } from "./invoiceTracker.rules.js";

/**
 * The project row's LATEST RECORD (Latest Invoice Amount + Status): pure rules, no database.
 * Records: raised-class invoices (Raised / Partially Paid / Paid) and Open invoice requests ("Pending Approval", no amount). A request
 * that was fulfilled is the same lifecycle as the invoice that fulfilled it. Newest first by record date, then creation instant, then id.
 */

const at = (iso: string) => new Date(iso);
const PID = "p1";
const inv = (id: string, no: string, status: string, amount: number, invoiceDate: string, createdAt: string): TrackerLine => ({
  id, projectId: PID, invoiceNo: no, status, invoiceAmountINR: amount, createdAt: at(createdAt), invoiceDate: at(`${invoiceDate}T00:00:00Z`),
});
const req = (id: string, status: "Open" | "Completed", createdAt: string, fulfilledInvoiceLineId: string | null = null): SummaryRequest => ({ id, status, createdAt: at(createdAt), fulfilledInvoiceLineId });
const latest = (lines: TrackerLine[], requests: SummaryRequest[], month: string | null) => selectLatestRecord(groupInvoices(lines), requests, month === null ? null : parseMonth(month));

test("1. one approval request and nothing raised: no amount, Pending Approval — and it is not a raised invoice", () => {
  const r = latest([], [req("aaaaaaaa-1111", "Open", "2026-10-12T06:00:00Z")], "2026-10")!;
  assert.equal(r.kind, "request");
  assert.equal(r.status, "PendingApproval");
  assert.equal(r.amountINR, null, "a request carries no amount — nothing has been raised");
  assert.equal(r.reference, shortRequestRef("aaaaaaaa-1111"));
  assert.equal(r.recordDate, "2026-10-12");
  assert.equal(r.inMonth, true);
  assert.equal(r.raisedLater, null);
});

test("2. the request becomes a raised invoice: the SAME lifecycle shows the entered amount and Raised — the fulfilled request is not a second record", () => {
  const lines = [inv("l1", "INV-1", "Raised", 150000, "2026-10-20", "2026-10-20T06:00:00Z")];
  const r = latest(lines, [req("bbbbbbbb-2222", "Completed", "2026-10-12T06:00:00Z", "l1")], "2026-10")!;
  assert.equal(r.kind, "invoice");
  assert.equal(r.status, "Raised");
  assert.equal(r.amountINR, 150000, "the amount Accounts entered");
  assert.equal(r.reference, "INV-1");
  assert.equal(r.requestRef, shortRequestRef("bbbbbbbb-2222"), "the request it fulfilled is shown as part of this record");
});

test("3. the raised invoice is paid: the same record now says Paid (and still the same amount — no duplicate)", () => {
  const raised = latest([inv("l1", "INV-1", "Raised", 150000, "2026-10-20", "2026-10-20T06:00:00Z")], [], "2026-10")!;
  const paid = latest([inv("l1", "INV-1", "Paid", 150000, "2026-10-20", "2026-10-20T06:00:00Z")], [], "2026-10")!;
  assert.equal(raised.status, "Raised");
  assert.equal(paid.status, "Paid");
  assert.deepEqual({ ...paid, status: "x" }, { ...raised, status: "x" }, "only the status differs: same record, same amount, same date");
});

test("Partially Paid stays Partially Paid at the invoice amount — a status change alone is never a recorded partial payment amount", () => {
  const r = latest([inv("l1", "INV-1", "PartiallyPaid", 80000, "2026-10-05", "2026-10-05T06:00:00Z")], [], "2026-10")!;
  assert.equal(r.status, "PartiallyPaid");
  assert.equal(r.amountINR, 80000);
  const legacy = latest([inv("l1", "INV-1", "Submitted", 5, "2026-10-05", "2026-10-05T06:00:00Z")], [], "2026-10")!;
  assert.equal(legacy.status, "Raised", "a legacy stored Submitted is Raised");
});

test("4. an older paid invoice and a NEWER pending request: the summary is the request; the invoice is still in the full order", () => {
  const lines = [inv("l1", "INV-OLD", "Paid", 90000, "2026-09-10", "2026-09-10T06:00:00Z")];
  const requests = [req("cccccccc-3333", "Open", "2026-10-14T06:00:00Z")];
  const r = latest(lines, requests, "2026-10")!;
  assert.equal(r.kind, "request");
  assert.equal(r.status, "PendingApproval");
  assert.equal(r.amountINR, null, "the summary never borrows the older invoice's amount");
  const order = orderAllRecords(groupInvoices(lines), requests);
  assert.deepEqual(order, [{ kind: "request", id: "cccccccc-3333" }, { kind: "invoice", id: "INV-OLD" }], "history keeps both, latest first");
});

test("5. several raised invoices: only the latest — never a sum, never a mix of amounts or statuses", () => {
  const lines = [
    inv("l1", "INV-1", "Paid", 1000, "2026-08-01", "2026-08-01T06:00:00Z"),
    inv("l2", "INV-2", "Raised", 2000, "2026-09-01", "2026-09-01T06:00:00Z"),
    inv("l3", "INV-3", "PartiallyPaid", 4000, "2026-10-02", "2026-10-02T06:00:00Z"),
  ];
  const r = latest(lines, [], "2026-10")!;
  assert.equal(r.reference, "INV-3");
  assert.equal(r.amountINR, 4000, "not 7000");
  assert.equal(r.status, "PartiallyPaid");
});

test("6. an older invoice's status changes after a newer one exists: it does NOT become the latest", () => {
  const newer = inv("l2", "INV-2", "Raised", 2000, "2026-10-10", "2026-10-10T06:00:00Z");
  for (const status of ["Raised", "PartiallyPaid", "Paid"]) {
    const older = inv("l1", "INV-1", status, 1000, "2026-09-01", "2026-09-01T06:00:00Z");
    const r = latest([older, newer], [], "2026-10")!;
    assert.equal(r.reference, "INV-2", `older invoice marked ${status} must not displace the newer one`);
    assert.equal(r.status, "Raised");
  }
});

test("order is by DATES and ids only — not by line order, status or what changed last", () => {
  const a = inv("l1", "INV-A", "Paid", 1, "2026-10-10", "2026-10-10T06:00:00Z");
  const b = inv("l2", "INV-B", "Raised", 2, "2026-10-11", "2026-10-11T06:00:00Z");
  assert.equal(latest([a, b], [], "2026-10")!.reference, "INV-B");
  assert.equal(latest([b, a], [], "2026-10")!.reference, "INV-B", "input order is irrelevant");
  // equal dates → later creation instant → then the id (descending): deterministic
  const t1 = inv("l3", "INV-T1", "Raised", 1, "2026-10-12", "2026-10-12T05:00:00Z");
  const t2 = inv("l4", "INV-T2", "Raised", 2, "2026-10-12", "2026-10-12T09:00:00Z");
  assert.equal(latest([t1, t2], [], "2026-10")!.reference, "INV-T2");
  const same1 = inv("l5", "INV-S1", "Raised", 1, "2026-10-12", "2026-10-12T05:00:00Z");
  const same2 = inv("l6", "INV-S2", "Raised", 2, "2026-10-12", "2026-10-12T05:00:00Z");
  assert.equal(latest([same1, same2], [], "2026-10")!.reference, "INV-S2");
  assert.equal(latest([same2, same1], [], "2026-10")!.reference, "INV-S2");
});

test("a request is dated by its India creation day: created 23:30 UTC on 10 Oct is already 11 Oct in India", () => {
  assert.equal(istDayOf(at("2026-10-10T23:30:00Z")).toISOString().slice(0, 10), "2026-10-11");
  const r = latest([inv("l1", "INV-1", "Raised", 1, "2026-10-11", "2026-10-10T20:00:00Z")], [req("dddddddd-4444", "Open", "2026-10-10T23:30:00Z")], "2026-10")!;
  assert.equal(r.recordDate, "2026-10-11");
  assert.equal(r.kind, "request", "same India day, later creation instant (23:30Z) wins over the invoice's 20:00Z");
});

test("7. an October request raised in November: October shows the REQUEST (no amount, Raised, pointing at the November invoice); November shows the invoice and its amount", () => {
  const lines = [inv("l1", "INV-NOV", "Raised", 250000, "2026-11-04", "2026-11-04T06:00:00Z")];
  const requests = [req("eeeeeeee-5555", "Completed", "2026-10-28T06:00:00Z", "l1")];
  const oct = latest(lines, requests, "2026-10")!;
  assert.equal(oct.kind, "request");
  assert.equal(oct.amountINR, null, "the invoice amount belongs to November, not to the month the request was made");
  assert.equal(oct.status, "Raised");
  assert.deepEqual(oct.raisedLater, { invoiceNo: "INV-NOV", invoiceDate: "2026-11-04" });
  assert.equal(oct.recordDate, "2026-10-28");
  const nov = latest(lines, requests, "2026-11")!;
  assert.equal(nov.kind, "invoice");
  assert.equal(nov.amountINR, 250000);
  assert.equal(nov.requestRef, shortRequestRef("eeeeeeee-5555"), "same lifecycle: November's invoice knows which request it fulfilled");
  assert.equal(nov.raisedLater, null);
  const all = latest(lines, requests, null)!;
  assert.equal(all.kind, "invoice", "all history: the request and its invoice are one record");
});

test("8. payment received in a later month: the invoice keeps its own month and amount and only its status moves — no second raised record", () => {
  const raisedInOct = latest([inv("l1", "INV-1", "Raised", 5000, "2026-10-15", "2026-10-15T06:00:00Z")], [], "2026-10")!;
  const paidInNov = [inv("l1", "INV-1", "Paid", 5000, "2026-10-15", "2026-10-15T06:00:00Z")];
  const octAfter = latest(paidInNov, [], "2026-10")!;
  assert.equal(octAfter.status, "Paid");
  assert.equal(octAfter.recordDate, raisedInOct.recordDate);
  assert.equal(octAfter.amountINR, 5000);
  assert.equal(latest(paidInNov, [], "2026-11")!.reference, "INV-1", "November still sees this same (October) invoice as the project's latest");
  assert.equal(latest(paidInNov, [], "2026-11")!.inMonth, false, "…flagged as not dated in November, so it is never mistaken for a November invoice");
  assert.equal(groupInvoices(paidInNov).length, 1, "one invoice, whatever its status");
});

test("9. no invoices and no requests: no latest record (the UI shows its empty state)", () => {
  assert.equal(latest([], [], "2026-10"), null);
  assert.equal(latest([], [], null), null);
});

test("drafts, cancelled invoices and unlinked completed requests are never the summary record — they stay in the history only", () => {
  const lines = [
    inv("l1", "INV-RAISED", "Raised", 1000, "2026-09-01", "2026-09-01T06:00:00Z"),
    inv("l2", "INV-DRAFT", "Draft", 5000, "2026-10-20", "2026-10-20T06:00:00Z"),
    inv("l3", "INV-CANC", "Cancelled", 6000, "2026-10-25", "2026-10-25T06:00:00Z"),
  ];
  const requests = [req("ffffffff-6666", "Completed", "2026-10-26T06:00:00Z", null)]; // completed by another raise, not linked
  const r = latest(lines, requests, "2026-10")!;
  assert.equal(r.reference, "INV-RAISED");
  assert.equal(latest([lines[1]!, lines[2]!], requests, "2026-10"), null, "nothing relevant at all");
  assert.equal(orderAllRecords(groupInvoices(lines), requests).length, 4, "the history still lists every record");
});

test("a month report ignores the future: a request or invoice after the month's end is not that month's latest", () => {
  const lines = [inv("l1", "INV-OCT", "Raised", 1000, "2026-10-05", "2026-10-05T06:00:00Z"), inv("l2", "INV-NOV", "Raised", 9000, "2026-11-05", "2026-11-05T06:00:00Z")];
  const requests = [req("11111111-7777", "Open", "2026-11-10T06:00:00Z")];
  assert.equal(latest(lines, requests, "2026-10")!.reference, "INV-OCT");
  assert.equal(latest(lines, requests, "2026-11")!.kind, "request", "November: the 10 Nov request is newer than the 5 Nov invoice");
  assert.equal(latest(lines, requests, null)!.kind, "request");
  // IST month edge: created 31 Oct 18:30 UTC = 1 Nov 00:00 IST → November, not October
  const edge = req("22222222-8888", "Open", "2026-10-31T18:30:00Z");
  assert.equal(latest([], [edge], "2026-10"), null);
  assert.equal(latest([], [edge], "2026-11")!.recordDate, "2026-11-01");
});

test("an invoice with no usable date cannot be placed in time: never the summary record, last in the history", () => {
  const undated = inv("l1", "INV-BAD", "Raised", 77, "1850-06-01", "2026-10-10T06:00:00Z");
  const dated = inv("l2", "INV-GOOD", "Raised", 10, "2026-10-01", "2026-10-01T06:00:00Z");
  assert.equal(latest([undated], [], "2026-10"), null);
  assert.equal(latest([undated, dated], [], null)!.reference, "INV-GOOD");
  assert.deepEqual(orderAllRecords(groupInvoices([undated, dated]), []).map((r) => r.id), ["INV-GOOD", "INV-BAD"]);
});

test("a completed request fulfilled by an invoice whose date is unusable: still shown as the request, pointing at it with no date", () => {
  const bad = inv("l1", "INV-BAD", "Raised", 77, "1850-06-01", "2026-10-10T06:00:00Z");
  const r = latest([bad], [req("33333333-9999", "Completed", "2026-10-09T06:00:00Z", "l1")], "2026-10")!;
  assert.equal(r.kind, "request");
  assert.deepEqual(r.raisedLater, { invoiceNo: "INV-BAD", invoiceDate: null });
});

test("a completed request whose fulfilling invoice is now Draft or Cancelled is not a lifecycle record any more", () => {
  for (const status of ["Draft", "Cancelled"]) {
    assert.equal(latest([inv("l1", "INV-1", status, 10, "2026-11-04", "2026-11-04T06:00:00Z")], [req("44444444-0000", "Completed", "2026-10-28T06:00:00Z", "l1")], "2026-10"), null, status);
  }
});

test("a multi-line invoice is one record with the summed live amount, and its status is the cascade of its lines", () => {
  const lines = [inv("a", "INV-M", "Paid", 100, "2026-10-05", "2026-10-05T06:00:00Z"), inv("b", "INV-M", "Raised", 200, "2026-10-06", "2026-10-06T06:00:00Z"), inv("c", "INV-M", "Cancelled", 999, "2026-10-07", "2026-10-07T06:00:00Z")];
  const r = latest(lines, [], "2026-10")!;
  assert.equal(r.amountINR, 300, "the cancelled line is not part of the invoice amount");
  assert.equal(r.status, "PartiallyPaid", "one line paid, one still raised");
  assert.equal(r.recordDate, "2026-10-05", "an invoice is dated by its earliest line");
});

test("two calls always agree (deterministic) and the full order puts the latest record first", () => {
  const lines = [inv("l1", "INV-1", "Paid", 1, "2026-08-01", "2026-08-01T06:00:00Z"), inv("l2", "INV-2", "Raised", 2, "2026-09-01", "2026-09-01T06:00:00Z")];
  const requests = [req("55555555-1111", "Open", "2026-09-15T06:00:00Z"), req("66666666-2222", "Completed", "2026-07-15T06:00:00Z", null)];
  const groups = groupInvoices(lines);
  const a = selectLatestRecord(groups, requests, parseMonth("2026-09"));
  const b = selectLatestRecord([...groups].reverse(), [...requests].reverse(), parseMonth("2026-09"));
  assert.deepEqual(a, b);
  const order = orderAllRecords(groups, requests);
  assert.deepEqual(order.map((o) => `${o.kind}:${o.id}`), ["request:55555555-1111", "invoice:INV-2", "invoice:INV-1", "request:66666666-2222"]);
  assert.equal(`${order[0]!.kind}:${order[0]!.id}`, `${a!.kind}:${a!.id}`, "the first of the full order IS the summary record");
});

test("the latest record is always first in the full order — a NEWER draft, cancelled invoice or unlinked completed request does not push it down", () => {
  const lines = [
    inv("l1", "INV-RAISED", "Raised", 1000, "2026-09-01", "2026-09-01T06:00:00Z"),
    inv("l2", "INV-DRAFT", "Draft", 5000, "2026-10-20", "2026-10-20T06:00:00Z"),
    inv("l3", "INV-CANC", "Cancelled", 6000, "2026-10-25", "2026-10-25T06:00:00Z"),
  ];
  const requests = [req("77777777-3333", "Completed", "2026-10-26T06:00:00Z", null)];
  const groups = groupInvoices(lines);
  const top = selectLatestRecord(groups, requests, parseMonth("2026-10"))!;
  assert.equal(top.reference, "INV-RAISED");
  const order = orderAllRecords(groups, requests, { kind: top.kind, id: top.id });
  assert.deepEqual(order.map((o) => o.id), ["INV-RAISED", "77777777-3333", "INV-CANC", "INV-DRAFT"], "latest first, then the rest newest to oldest");
  assert.deepEqual(orderAllRecords(groups, requests).map((o) => o.id), ["77777777-3333", "INV-CANC", "INV-DRAFT", "INV-RAISED"], "without it, plain newest-first");
});
