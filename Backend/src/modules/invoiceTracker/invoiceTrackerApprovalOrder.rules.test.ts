import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approvalSubmittedAtOf,
  compareProjectRows,
  groupInvoices,
  linkRequestsToInvoices,
  parseMonth,
  rankProject,
  selectLatestRecord,
  type InvoiceGroup,
  type MonthWindow,
  type ProjectRank,
  type SummaryRequest,
  type TrackerLine,
} from "./invoiceTracker.rules.js";

/**
 * Invoice Tracker — WHERE A PROJECT ROW SITS. Pure rules, no database.
 *
 * A project's position is decided by the ORIGINAL approval submission (InvoiceRequest.createdAt) of the very record its row displays, LATEST
 * submission first. A status change, a payment, the fulfilment of the request or an edit of the invoice date must never move the row, because
 * none of them changes that instant or the request → invoice link. A request submitted later becomes the displayed record and then orders the row.
 * Projects without an approval request in the month follow, by the date of the record they display, LATEST first (PR number, then record id).
 */

const at = (iso: string) => new Date(iso);
const OCT = parseMonth("2026-10")!;
const line = (id: string, projectId: string, no: string, status: string, amount: number, invoiceDate: string): TrackerLine => ({
  id, projectId, invoiceNo: no, status, invoiceAmountINR: amount, invoiceDate: at(`${invoiceDate}T00:00:00Z`), createdAt: at(`${invoiceDate}T06:00:00Z`),
});
const req = (id: string, status: "Open" | "Completed", createdAt: string, fulfilledInvoiceLineId: string | null = null): SummaryRequest => ({ id, status, createdAt: at(createdAt), fulfilledInvoiceLineId });

interface Project {
  id: string;
  prNo: string;
  lines: TrackerLine[];
  requests: SummaryRequest[];
}

/** Everything the service does to place one project: the displayed record, its approval submission, the rank. */
function place(p: Project, window: MonthWindow | null): { rank: ProjectRank; approval: Date | null; displayed: string | null } {
  const groups: InvoiceGroup[] = groupInvoices(p.lines);
  const latest = selectLatestRecord(groups, p.requests, window);
  const approval = approvalSubmittedAtOf(latest, groups, p.requests);
  // nothing displayed: the project's LATEST covered request still places it (as the service does)
  const latestCovered = p.requests.filter((r) => window === null || (r.createdAt >= window.start && r.createdAt < window.end)).map((r) => r.createdAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const newest = p.lines.length > 0 ? new Date(Math.max(...p.lines.map((l) => l.invoiceDate!.getTime()))) : null;
  const rank = rankProject({ latest, approvalSubmittedAt: latest ? approval : latestCovered, fallbackAt: newest }, window);
  return { rank, approval, displayed: latest ? `${latest.kind}:${latest.reference}:${latest.status}` : null };
}
const sorted = (projects: Project[], window: MonthWindow | null) =>
  projects
    .map((p) => ({ p, rank: place(p, window).rank }))
    .sort((a, b) => compareProjectRows({ rank: a.rank, prNo: a.p.prNo, id: a.p.id }, { rank: b.rank, prNo: b.p.prNo, id: b.p.id }, (x, y) => x.localeCompare(y)));
const order = (projects: Project[], window: MonthWindow | null): string[] => sorted(projects, window).map(({ p }) => p.prNo);
const orderIds = (projects: Project[], window: MonthWindow | null): string[] => sorted(projects, window).map(({ p }) => p.id);

test("1. the LATEST approval submission is first: B (5 Oct) above A (3 Oct), whatever the PR numbers", () => {
  const a: Project = { id: "pa", prNo: "PR-A", lines: [], requests: [req("ra", "Open", "2026-10-03T06:00:00Z")] };
  const b: Project = { id: "pb", prNo: "PR-B", lines: [], requests: [req("rb", "Open", "2026-10-05T06:00:00Z")] };
  // PR-A sorts before PR-B alphabetically, so only the submission instant can put B first
  assert.deepEqual(order([a, b], OCT), ["PR-B", "PR-A"]);
  assert.deepEqual(order([b, a], OCT), ["PR-B", "PR-A"], "input order is irrelevant");
  assert.deepEqual(order([a, b], null), ["PR-B", "PR-A"], "all history: the same");
});

test("1b. the example from the requirement: 25 Oct Paid, 23 Oct Raised, 21 Oct Pending, 18 Oct Completed — and no status change moves any row", () => {
  // each project's status changes through its lifecycle; its original submission never changes
  const make = (prNo: string, id: string, submitted: string, status: "Pending" | "Raised" | "PartiallyPaid" | "Paid" | "Completed"): Project => {
    const lineId = `l-${id}`;
    if (status === "Pending") return { id, prNo, lines: [], requests: [req(`r-${id}`, "Open", submitted)] };
    if (status === "Completed") return { id, prNo, lines: [], requests: [req(`r-${id}`, "Completed", submitted, null)] }; // completed, no invoice carries it
    return { id, prNo, lines: [line(lineId, id, `INV-${id}`, status, 100, "2026-10-26")], requests: [req(`r-${id}`, "Completed", submitted, lineId)] };
  };
  const EXPECTED = ["PR-1003", "PR-1002", "PR-1005", "PR-1001"];
  const states = [
    ["Pending", "Pending", "Pending", "Pending"],
    ["Paid", "Raised", "Pending", "Completed"], // the table in the requirement
    ["Paid", "Paid", "Paid", "Paid"],
    ["Raised", "PartiallyPaid", "Raised", "PartiallyPaid"],
    ["Pending", "Paid", "Completed", "Raised"],
  ] as const;
  for (const [s1003, s1002, s1005, s1001] of states) {
    const projects = [make("PR-1001", "p1001", "2026-10-18T06:00:00Z", s1001), make("PR-1005", "p1005", "2026-10-21T06:00:00Z", s1005), make("PR-1002", "p1002", "2026-10-23T06:00:00Z", s1002), make("PR-1003", "p1003", "2026-10-25T06:00:00Z", s1003)];
    assert.deepEqual(order(projects, OCT), EXPECTED, `${s1003}/${s1002}/${s1005}/${s1001}: the latest submission is first, whatever the status`);
    assert.deepEqual(order(projects, null), EXPECTED, `${s1003}/${s1002}/${s1005}/${s1001}: all history agrees`);
  }
});

test("2-3. approval A becomes a Raised invoice and is then Paid: the row keeps its position while the displayed status updates", () => {
  const older: Project = { id: "pb", prNo: "PR-2", lines: [], requests: [req("rb", "Open", "2026-10-02T06:00:00Z")] };
  const stages = [
    { label: "pending", lines: [] as TrackerLine[], requests: [req("ra", "Open", "2026-10-05T06:00:00Z")] },
    { label: "raised", lines: [line("l1", "pa", "INV-1", "Raised", 5000, "2026-10-01")], requests: [req("ra", "Completed", "2026-10-05T06:00:00Z", "l1")] },
    { label: "partially paid", lines: [line("l1", "pa", "INV-1", "PartiallyPaid", 5000, "2026-10-01")], requests: [req("ra", "Completed", "2026-10-05T06:00:00Z", "l1")] },
    { label: "paid", lines: [line("l1", "pa", "INV-1", "Paid", 5000, "2026-10-01")], requests: [req("ra", "Completed", "2026-10-05T06:00:00Z", "l1")] },
  ];
  const seen: string[] = [];
  for (const s of stages) {
    const a: Project = { id: "pa", prNo: "PR-9", lines: s.lines, requests: s.requests };
    const placed = place(a, OCT);
    assert.equal(placed.rank.group, 1, `${s.label}: ordered by approval submission`);
    assert.equal(placed.rank.approvalAt, at("2026-10-05T06:00:00Z").getTime(), `${s.label}: the ORIGINAL submission instant, whatever the status`);
    assert.deepEqual(order([older, a], OCT), ["PR-9", "PR-2"], `${s.label}: A (submitted 5 Oct) stays above the earlier 2 Oct submission, though its invoice is dated 1 Oct`);
    seen.push(placed.displayed!);
  }
  assert.match(seen[0]!, /^request:.*:PendingApproval$/);
  assert.equal(seen[1], "invoice:INV-1:Raised", "the invoice takes over the SAME row, with the amount Accounts entered");
  assert.equal(seen[3], "invoice:INV-1:Paid", "…and a later payment only changes its status");
});

test("4. editing the invoice date does not change the approval-based position (even when the invoice leaves the month)", () => {
  const other: Project = { id: "pb", prNo: "PR-2", lines: [], requests: [req("rb", "Open", "2026-10-05T06:00:00Z")] };
  const submitted = "2026-10-03T06:00:00Z";
  for (const date of ["2026-10-01", "2026-10-31", "2026-09-15", "2026-11-20"]) {
    const a: Project = { id: "pa", prNo: "PR-9", lines: [line("l1", "pa", "INV-1", "Raised", 5000, date)], requests: [req("ra", "Completed", submitted, "l1")] };
    const placed = place(a, OCT);
    assert.equal(placed.rank.group, 1, `invoice dated ${date}`);
    assert.equal(placed.rank.approvalAt, at(submitted).getTime(), `invoice dated ${date}: the key is the submission instant, not the invoice date`);
    assert.deepEqual(order([other, a], OCT), ["PR-2", "PR-9"], `invoice dated ${date}: the 5 Oct submission stays above the 3 Oct one`);
  }
});

test("4b. an invoice dated AFTER the month: the month still shows (and orders by) the request — the invoice's own month shows the invoice", () => {
  const a: Project = { id: "pa", prNo: "PR-9", lines: [line("l1", "pa", "INV-1", "Raised", 5000, "2026-11-20")], requests: [req("ra", "Completed", "2026-10-03T06:00:00Z", "l1")] };
  const oct = place(a, OCT);
  assert.match(oct.displayed!, /^request:.*:Raised$/, "October: the request, status Raised, pointing at the November invoice");
  assert.equal(oct.rank.group, 1);
  const nov = place(a, parseMonth("2026-11"));
  assert.equal(nov.displayed, "invoice:INV-1:Raised");
  assert.equal(nov.rank.group, 2, "November has no approval submitted in November: the displayed record's date orders it");
});

test("5. several requests and invoices on one project: the displayed record and its OWN request give the position; amounts and statuses are never mixed", () => {
  // lifecycle 1: request 1 Oct → invoice INV-1 (Paid). lifecycle 2: request 12 Oct, still open.
  const p: Project = {
    id: "pd", prNo: "PR-4",
    lines: [line("l1", "pd", "INV-1", "Paid", 1000, "2026-10-08")],
    requests: [req("r1", "Completed", "2026-10-01T06:00:00Z", "l1"), req("r2", "Open", "2026-10-12T06:00:00Z")],
  };
  const placed = place(p, OCT);
  assert.match(placed.displayed!, /^request:.*:PendingApproval$/, "the latest record is the open request");
  assert.equal(placed.approval?.toISOString(), "2026-10-12T06:00:00.000Z", "…and the row is positioned by THAT request, not by the older lifecycle");
  // when the second request is fulfilled too, the same instant keeps ordering the row
  const raised: Project = { ...p, lines: [...p.lines, line("l2", "pd", "INV-2", "Raised", 2000, "2026-10-20")], requests: [req("r1", "Completed", "2026-10-01T06:00:00Z", "l1"), req("r2", "Completed", "2026-10-12T06:00:00Z", "l2")] };
  const after = place(raised, OCT);
  assert.equal(after.displayed, "invoice:INV-2:Raised");
  assert.equal(after.approval?.toISOString(), "2026-10-12T06:00:00.000Z");
  assert.equal(after.rank.key, placed.rank.key, "fulfilling the request did not move the row");
  const linked = linkRequestsToInvoices(groupInvoices(raised.lines), raised.requests);
  assert.deepEqual([...linked.entries()].map(([g, r]) => [g.key, r.id]).sort(), [["INV-1", "r1"], ["INV-2", "r2"]], "each invoice is associated with its own request");
});

test("5b. a multi-line invoice is ONE record: the request linked to any of its lines orders the project once", () => {
  const lines = [line("l1", "pf", "INV-F", "Raised", 100, "2026-10-09"), line("l2", "pf", "INV-F", "Raised", 200, "2026-10-09")];
  const p: Project = { id: "pf", prNo: "PR-6", lines, requests: [req("rf", "Completed", "2026-10-06T06:00:00Z", "l2")] };
  const placed = place(p, OCT);
  assert.equal(placed.displayed, "invoice:INV-F:Raised");
  assert.equal(placed.approval?.toISOString(), "2026-10-06T06:00:00.000Z", "linked through the SECOND line, still the invoice's request");
  assert.equal(linkRequestsToInvoices(groupInvoices(lines), p.requests).size, 1, "no duplicate association");
});

test("6. requests WITHOUT invoices, un-linked historical requests and deleted links still place and display correctly", () => {
  // an open request with no invoice at all
  const open: Project = { id: "po", prNo: "PR-1", lines: [], requests: [req("ro", "Open", "2026-10-09T06:00:00Z")] };
  assert.match(place(open, OCT).displayed!, /^request:.*:PendingApproval$/);
  assert.deepEqual([place(open, OCT).rank.group, place(open, OCT).rank.approvalAt], [1, at("2026-10-09T06:00:00Z").getTime()]);
  // requests completed by some other raise (no link) and nothing else: nothing is displayed, and the project's LATEST request still places it
  const orphan: Project = { id: "pe", prNo: "PR-5", lines: [], requests: [req("re1", "Completed", "2026-10-07T06:00:00Z", null), req("re2", "Completed", "2026-10-12T06:00:00Z", null)] };
  const placed = place(orphan, OCT);
  assert.equal(placed.displayed, null, "nothing to display — and nothing invented");
  assert.deepEqual([placed.rank.group, placed.rank.basis, placed.rank.approvalAt], [1, "approval_submitted", at("2026-10-12T06:00:00Z").getTime()], "the latest of its requests (12 Oct)");
  // an invoice raised outside the workflow has no approval: it follows the month's other rules
  const direct: Project = { id: "pc", prNo: "PR-3", lines: [line("l9", "pc", "INV-9", "Raised", 10, "2026-10-20")], requests: [] };
  const d = place(direct, OCT);
  assert.equal(d.approval, null);
  assert.deepEqual([d.rank.group, d.rank.basis, d.rank.approvalAt], [2, "record_date", null]);
  // a link whose invoice was deleted (ON DELETE SET NULL) leaves a completed request with no link and no invoice: same as an orphan
  const deleted: Project = { id: "px", prNo: "PR-7", lines: [], requests: [req("rx", "Completed", "2026-10-09T06:00:00Z", null)] };
  assert.equal(place(deleted, OCT).displayed, null);
  // …and when a (re-created) invoice is displayed instead, it has no approval and takes its place among the other displayed records
  const recreated: Project = { id: "pr", prNo: "PR-8", lines: [line("l7", "pr", "INV-7", "Raised", 5, "2026-10-12")], requests: [req("rr", "Completed", "2026-10-08T06:00:00Z", null)] };
  assert.deepEqual([place(recreated, OCT).rank.group, place(recreated, OCT).approval], [2, null]);
});

test("7. projects without an approval request in the month follow by the date of the record they display, LATEST first; nothing displayed comes last", () => {
  const mk = (n: number, no: string, status: string, date: string): Project => ({ id: `p${n}`, prNo: `PR-${n}`, lines: [line(no.toLowerCase(), `p${n}`, no, status, 1, date)], requests: [] });
  const a = mk(1, "A", "Raised", "2026-10-10");
  const b = mk(2, "B", "Paid", "2026-10-12");
  const c = mk(3, "C", "Raised", "2026-10-28");
  const d = mk(4, "D", "Raised", "2026-10-02");
  const draftOnly = mk(5, "E", "Draft", "2026-10-29");
  assert.deepEqual(order([draftOnly, c, b, d, a], OCT), ["PR-3", "PR-2", "PR-1", "PR-4", "PR-5"], "28 Oct, 12 Oct, 10 Oct, 2 Oct, then the project that displays nothing");
  assert.deepEqual(place(a, OCT).rank, { group: 2, key: -at("2026-10-10T00:00:00Z").getTime(), basis: "record_date", recordId: "A", approvalAt: null });
  assert.equal(place(draftOnly, OCT).rank.group, 3);
  // projects that display nothing are also latest first among themselves
  const draft2 = mk(6, "F", "Draft", "2026-10-03");
  assert.deepEqual(order([draft2, draftOnly], OCT), ["PR-5", "PR-6"]);
  // all history: no approval anywhere -> plain PR-number order
  assert.deepEqual(order([draftOnly, c, b, d, a], null), ["PR-1", "PR-2", "PR-3", "PR-4", "PR-5"]);
  assert.equal(place(a, null).rank.basis, "pr_number");
  // approvals still come first, whatever the invoice dates of the others
  const approved: Project = { id: "pz", prNo: "PR-9", lines: [], requests: [req("rz", "Open", "2026-10-01T06:00:00Z")] };
  assert.deepEqual(order([a, c, approved], OCT), ["PR-9", "PR-3", "PR-1"]);
});

test("8. Monthly Report and All History order projects with an approval the same way; the unapproved ones follow", () => {
  const mk = (n: number, submitted: string): Project => ({ id: `p${n}`, prNo: `PR-${10 - n}`, lines: [], requests: [req(`r${n}`, "Open", submitted)] });
  const projects = [mk(1, "2026-10-20T06:00:00Z"), mk(2, "2026-10-02T06:00:00Z"), mk(3, "2026-10-11T06:00:00Z")];
  const none: Project = { id: "p0", prNo: "PR-0", lines: [line("z", "p0", "Z", "Raised", 1, "2026-10-14")], requests: [] };
  const monthly = order([none, ...projects], OCT);
  const history = order([none, ...projects], null);
  assert.deepEqual(monthly, ["PR-9", "PR-7", "PR-8", "PR-0"], "p1 (20 Oct), p3 (11 Oct), p2 (2 Oct), then the project with no approval");
  assert.deepEqual(history, monthly, "the same sequence in all history");
  // a month other than the submission month: the approval is not "the month's own", so the month's other rules apply
  assert.notEqual(place(projects[0]!, parseMonth("2026-11")).rank.group, 1, "an October approval does not order November's report");
  assert.equal(place(projects[0]!, parseMonth("2026-10")).rank.group, 1);
});

test("a total, stable order: equal instants fall back to PR number, then the displayed record's id, then the project id", () => {
  const same = "2026-10-03T06:00:00Z";
  const ps: Project[] = [
    { id: "b", prNo: "PR-2", lines: [], requests: [req("r-b", "Open", same)] },
    { id: "a", prNo: "PR-2", lines: [], requests: [req("r-a", "Open", same)] },
    { id: "c", prNo: "PR-1", lines: [], requests: [req("r-c", "Open", same)] },
  ];
  assert.deepEqual(orderIds(ps, OCT), ["c", "a", "b"], "PR-1 first; for the same PR number the displayed record id (r-a < r-b) decides");
  assert.deepEqual(orderIds([...ps].reverse(), OCT), ["c", "a", "b"], "the same input always gives the same sequence");
  // the record id, not the project id, is what breaks the tie
  const swapped: Project[] = [
    { id: "a", prNo: "PR-2", lines: [], requests: [req("r-z", "Open", same)] },
    { id: "b", prNo: "PR-2", lines: [], requests: [req("r-y", "Open", same)] },
  ];
  assert.deepEqual(orderIds(swapped, OCT), ["b", "a"]);
});

test("9. a NEW approval request becomes the displayed record and moves the row to the TOP — the project's first-ever request no longer holds it", () => {
  const old = { lines: [line("l1", "pa", "INV-A", "Paid", 5000, "2026-10-06")], req: req("ra", "Completed", "2026-10-03T06:00:00Z", "l1") };
  const before = place({ id: "pa", prNo: "PR-9", lines: old.lines, requests: [old.req] }, OCT);
  assert.equal(before.rank.approvalAt, at("2026-10-03T06:00:00Z").getTime());
  const submitted = place({ id: "pa", prNo: "PR-9", lines: old.lines, requests: [old.req, req("rb", "Open", "2026-10-20T06:00:00Z")] }, OCT);
  assert.match(submitted.displayed!, /^request:.*:PendingApproval$/, "the new request is the displayed record");
  assert.equal(submitted.rank.approvalAt, at("2026-10-20T06:00:00Z").getTime(), "so the NEW submission orders the row");
  // fulfilled by its own invoice: the new request's instant keeps ordering the row
  const fulfilled = place({ id: "pa", prNo: "PR-9", lines: [...old.lines, line("l2", "pa", "INV-B", "Raised", 800, "2026-10-22")], requests: [old.req, req("rb", "Completed", "2026-10-20T06:00:00Z", "l2")] }, OCT);
  assert.equal(fulfilled.displayed, "invoice:INV-B:Raised");
  assert.equal(fulfilled.rank.approvalAt, at("2026-10-20T06:00:00Z").getTime());
  // relative to another project submitted between the two requests, the row moves from below it to above it
  const between: Project = { id: "pm", prNo: "PR-1", lines: [], requests: [req("rm", "Open", "2026-10-10T06:00:00Z")] };
  assert.deepEqual(order([{ id: "pa", prNo: "PR-9", lines: old.lines, requests: [old.req] }, between], OCT), ["PR-1", "PR-9"]);
  assert.deepEqual(order([{ id: "pa", prNo: "PR-9", lines: old.lines, requests: [old.req, req("rb", "Open", "2026-10-20T06:00:00Z")] }, between], OCT), ["PR-9", "PR-1"]);
});

test("10. editing an OLD invoice's date cannot make the old lifecycle the displayed one (so it cannot move the row)", () => {
  const rb = req("rb", "Completed", "2026-10-20T06:00:00Z", "l2");
  const ra = (date: string) => ({ lines: [line("l1", "pa", "INV-A", "Paid", 5000, date), line("l2", "pa", "INV-B", "Raised", 800, "2026-10-22")], requests: [req("ra", "Completed", "2026-10-03T06:00:00Z", "l1"), rb] });
  for (const date of ["2026-10-06", "2026-10-31", "2026-11-25", "2026-09-01"]) {
    const placed = place({ id: "pa", prNo: "PR-9", ...ra(date) }, OCT);
    assert.equal(placed.displayed, "invoice:INV-B:Raised", `INV-A dated ${date}: still the newer lifecycle`);
    assert.equal(placed.rank.approvalAt, at("2026-10-20T06:00:00Z").getTime(), `INV-A dated ${date}: the row keeps the 20 Oct submission`);
  }
  // an invoice raised OUTSIDE the request workflow has no submission: it is as recent as its own invoice date, as before
  const standalone = place({ id: "px", prNo: "PR-2", lines: [line("l1", "px", "INV-A", "Paid", 1, "2026-10-25"), line("l9", "px", "INV-X", "Raised", 2, "2026-10-10")], requests: [req("ra", "Completed", "2026-10-03T06:00:00Z", "l1")] }, OCT);
  assert.equal(standalone.displayed, "invoice:INV-X:Raised", "the linked INV-A is as recent as its 3 Oct request, not its 25 Oct invoice date; INV-X (10 Oct) is newer");
});

test("11. month boundaries are exact (India time): 23:59:59 IST on 30 Sep is September, 00:00:00 IST on 1 Oct is October; 23:59:59 IST on 31 Oct is October, 00:00:00 IST on 1 Nov is November", () => {
  const SEP = parseMonth("2026-09")!;
  const NOV = parseMonth("2026-11")!;
  const only = (id: string, submitted: string): Project => ({ id, prNo: `PR-${id}`, lines: [], requests: [req(`r-${id}`, "Open", submitted)] });
  const lastSep = only("a", "2026-09-30T18:29:59Z"); // 23:59:59 IST, 30 Sep
  const firstOct = only("b", "2026-09-30T18:30:00Z"); // 00:00:00 IST, 1 Oct
  const lastOct = only("c", "2026-10-31T18:29:59Z"); // 23:59:59 IST, 31 Oct
  const firstNov = only("d", "2026-10-31T18:30:00Z"); // 00:00:00 IST, 1 Nov
  const groupIn = (p: Project, w: MonthWindow) => place(p, w).rank.group;
  // group 1 = a request submitted IN that month; group 2 = an older request is still the displayed record but does not order by submission;
  // group 3 = a request submitted AFTER the month's end is not part of that month at all (nothing displayed)
  assert.deepEqual([groupIn(lastSep, SEP), groupIn(lastSep, OCT)], [1, 2], "30 Sep 23:59:59 is a September submission, not an October one");
  assert.deepEqual([groupIn(firstOct, SEP), groupIn(firstOct, OCT)], [3, 1], "1 Oct 00:00:00 is an October submission, and does not exist yet in September");
  assert.deepEqual([groupIn(lastOct, OCT), groupIn(lastOct, NOV)], [1, 2], "31 Oct 23:59:59 is an October submission, not a November one");
  assert.deepEqual([groupIn(firstNov, OCT), groupIn(firstNov, NOV)], [3, 1], "1 Nov 00:00:00 is a November submission, and does not exist yet in October");
  // inside October the later boundary submission is first
  assert.deepEqual(order([firstOct, lastOct], OCT), ["PR-c", "PR-b"]);
});

test("12. pagination: the order is total, so every page size yields the same sequence — no gaps, no duplicates — whatever the input order", () => {
  const projects: Project[] = [];
  for (let n = 1; n <= 23; n++) {
    const day = String(((n * 7) % 28) + 1).padStart(2, "0");
    projects.push(n % 4 === 0
      ? { id: `p${n}`, prNo: `PR-${100 + (n % 5)}`, lines: [line(`l${n}`, `p${n}`, `INV-${n}`, "Raised", 1, `2026-10-${day}`)], requests: [] }
      : { id: `p${n}`, prNo: `PR-${100 + (n % 5)}`, lines: [], requests: [req(`r${n}`, "Open", `2026-10-${day}T06:00:00Z`)] });
  }
  const full = orderIds(projects, OCT);
  assert.equal(new Set(full).size, 23, "every project exactly once");
  for (const size of [1, 2, 5, 7, 25]) {
    const pages: string[] = [];
    for (let start = 0; start < full.length; start += size) pages.push(...full.slice(start, start + size));
    assert.deepEqual(pages, full, `page size ${size}`);
  }
  assert.deepEqual(orderIds([...projects].reverse(), OCT), full, "a different input order gives the same sequence");
  assert.deepEqual(orderIds([...projects].sort((a, b) => a.id.localeCompare(b.id)), OCT), full);
  // approval-ordered rows are strictly latest first
  const approvals = sorted(projects, OCT).filter(({ rank }) => rank.group === 1).map(({ rank }) => rank.approvalAt!);
  assert.deepEqual(approvals, [...approvals].sort((x, y) => y - x));
});

test("approvalSubmittedAtOf: a request's own instant; an invoice's linked request; null when nothing is linked — nothing is invented", () => {
  const lines = [line("l1", "p", "INV-1", "Raised", 1, "2026-10-08"), line("l2", "p", "INV-2", "Raised", 1, "2026-10-09")];
  const requests = [req("r1", "Completed", "2026-10-01T06:00:00Z", "l1")];
  const groups = groupInvoices(lines);
  const inv1 = selectLatestRecord(groups.filter((g) => g.key === "INV-1"), requests, OCT);
  const inv2 = selectLatestRecord(groups.filter((g) => g.key === "INV-2"), requests, OCT);
  assert.equal(approvalSubmittedAtOf(inv1, groups, requests)?.toISOString(), "2026-10-01T06:00:00.000Z");
  assert.equal(approvalSubmittedAtOf(inv2, groups, requests), null, "raised outside the request workflow");
  assert.equal(approvalSubmittedAtOf(null, groups, requests), null);
  const open = selectLatestRecord([], [req("r9", "Open", "2026-10-15T06:00:00Z")], OCT);
  assert.equal(approvalSubmittedAtOf(open, [], [req("r9", "Open", "2026-10-15T06:00:00Z")])?.toISOString(), "2026-10-15T06:00:00.000Z");
});
