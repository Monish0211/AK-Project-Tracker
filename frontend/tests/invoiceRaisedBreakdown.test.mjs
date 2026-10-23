// Invoice Tracker — the "Raised invoice amount" card and its breakdown. Server-side rendering and pure rules (no browser): the breakdown's states,
// grouping and reconciliation display, the card's actionable mode, the dialog shell's accessibility structure, and the wiring to the list's query.
// The click / keyboard / focus behaviour of the open dialog is exercised in a real browser (see the task report), not here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
let React;
let renderToStaticMarkup;
before(async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
  globalThis.sessionStorage = globalThis.localStorage;
  globalThis.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        name: "stub-notification-service",
        enforce: "pre",
        load(id) {
          return id.split("\\").join("/").endsWith("/src/notifications/notificationService.ts") ? "export const notificationService = new Proxy({}, { get: () => () => undefined });" : null;
        },
      },
    ],
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

const h = (...a) => React.createElement(...a);
const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n"); // checkouts may use CRLF
const flat = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const LOGIC = "/src/pages/InvoiceTracker/raisedBreakdownLogic.ts";
const PANEL = "/src/pages/InvoiceTracker/RaisedBreakdown.tsx";

const inv = (key, over = {}) => ({ key, invoiceNo: key, invoiceDate: "2026-10-05", status: "Raised", amountINR: 1000, cancelledLineCount: 0, ...over });
const project = (n, invoices, over = {}) => ({
  projectId: `pid-${n}`, prNo: `PR-${n}`, client: `Client ${n}`, projectTitle: `Title ${n}`, projectStatus: "Active",
  invoiceCount: invoices.length, totalINR: invoices.reduce((s, i) => s + i.amountINR, 0), invoices, ...over,
});
const pageOf = (projects, over = {}) => ({
  month: "2026-10", totalINR: projects.reduce((s, p) => s + p.totalINR, 0), invoiceCount: projects.reduce((s, p) => s + p.invoiceCount, 0), projectCount: projects.length, projects, page: 1, pageSize: 25, totalPages: 1, periodStart: "2026-10-01", ...over,
});
const query = (over = {}) => ({ month: "2026-10", search: "", projectStatus: "", filter: "all", ...over });

// ───────── the pure rules ─────────

test("a different month, search, status, 'Show' filter, page refresh or retry is a different request — the same ones are the same (so nothing is fetched twice)", async () => {
  const { requestKeyOf } = await load(LOGIC);
  const base = requestKeyOf(query(), 0, 0);
  assert.equal(requestKeyOf(query(), 0, 0), base, "identical inputs → identical key (a reopened dialog reuses its answer)");
  for (const changed of [query({ month: "2026-09" }), query({ search: "acme" }), query({ projectStatus: "Active" }), query({ filter: "raised" })]) assert.notEqual(requestKeyOf(changed, 0, 0), base, JSON.stringify(changed));
  assert.notEqual(requestKeyOf(query(), 1, 0), base, "the page reloaded its data → ask again");
  assert.notEqual(requestKeyOf(query(), 0, 1), base, "Try again → ask again");
});

test("what the panel shows in each state: closed and never answered is idle; open and waiting is loading; a failure is an error; a response is ready with the WHOLE report's figures", async () => {
  const { deriveBreakdown } = await load(LOGIC);
  const base = { pages: [], error: null, loadingMore: false, moreError: null };
  assert.equal(deriveBreakdown({ ...base, enabled: false, answered: false }).status, "idle");
  assert.equal(deriveBreakdown({ ...base, enabled: true, answered: false }).status, "loading");
  const failed = deriveBreakdown({ ...base, enabled: true, answered: true, error: "The server could not build the breakdown." });
  assert.deepEqual([failed.status, failed.error, failed.projects], ["error", "The server could not build the breakdown.", []]);
  assert.equal(deriveBreakdown({ ...base, enabled: true, answered: true }).error, "Something went wrong. Please try again.", "never an empty error");
  const p1 = pageOf([project(1, [inv("A", { amountINR: 500 })]), project(2, [inv("B", { amountINR: 300 })])], { totalINR: 5000, invoiceCount: 7, projectCount: 40, totalPages: 2 });
  const ready = deriveBreakdown({ ...base, enabled: true, answered: true, pages: [p1] });
  assert.deepEqual([ready.status, ready.totalINR, ready.invoiceCount, ready.projectCount, ready.hasMore], ["ready", 5000, 7, 40, true], "the header is the server's whole-report figures, not the sum of the loaded projects");
  assert.equal(ready.projects.length, 2);
  const reopened = deriveBreakdown({ ...base, enabled: false, answered: true, pages: [p1] });
  assert.equal(reopened.status, "ready", "closed again but answered: the data is kept");
  const done = deriveBreakdown({ ...base, enabled: true, answered: true, pages: [p1, { ...p1, page: 2, projects: [project(3, [inv("C")])] }] });
  assert.deepEqual([done.hasMore, done.projects.map((p) => p.prNo)], [false, ["PR-1", "PR-2", "PR-3"]], "no 'show more' once the last page is loaded");
  const more = deriveBreakdown({ ...base, enabled: true, answered: true, pages: [p1], loadingMore: true, moreError: "x" });
  assert.deepEqual([more.loadingMore, more.moreError, more.status], [true, "x", "ready"], "a failed 'show more' keeps what is already shown");
});

test("pages combine in the server's order with every project once", async () => {
  const { mergeProjectPages } = await load(LOGIC);
  const a = project(1, [inv("A")]);
  const b = project(2, [inv("B")]);
  const c = project(3, [inv("C")]);
  assert.deepEqual(mergeProjectPages([pageOf([a, b]), pageOf([b, c])]).map((p) => p.prNo), ["PR-1", "PR-2", "PR-3"], "a project that appears on two pages is not shown twice");
  assert.deepEqual(mergeProjectPages([]), []);
});

test("expand / collapse: untouched projects are closed (open only when there is just one); a toggle flips one; expand/collapse all set every project", async () => {
  const { isProjectOpen, withProjectToggled, withEveryProject } = await load(LOGIC);
  const none = new Map();
  assert.equal(isProjectOpen(none, "p1", false), false, "closed by default");
  assert.equal(isProjectOpen(none, "p1", true), true, "a single project starts open");
  const opened = withProjectToggled(none, "p1", false);
  assert.equal(isProjectOpen(opened, "p1", false), true);
  assert.equal(isProjectOpen(opened, "p2", false), false, "the others are untouched");
  assert.equal(isProjectOpen(withProjectToggled(opened, "p1", true), "p1", false), false, "and back");
  assert.equal(isProjectOpen(withProjectToggled(none, "p1", true), "p1", true), false, "a single project can be collapsed");
  const all = [{ projectId: "p1" }, { projectId: "p2" }];
  assert.ok(["p1", "p2"].every((id) => isProjectOpen(withEveryProject(all, true), id, false)), "expand all");
  assert.ok(["p1", "p2"].every((id) => !isProjectOpen(withEveryProject(all, false), id, true)), "collapse all beats the single-project default");
  assert.equal(none.size, 0, "pure: nothing is mutated");
});

test("the filter note says the breakdown follows the list's filters — and is empty when nothing is filtered", async () => {
  const { filterNoteOf } = await load(LOGIC);
  assert.equal(filterNoteOf(query()), "");
  assert.equal(filterNoteOf(query({ search: "acme" })), "Filtered by search “acme” — the same filters as the list.");
  assert.match(filterNoteOf(query({ search: "x", projectStatus: "On Hold", filter: "requestPending" })), /search “x” · status On Hold · Invoice request open \(\+\)/);
  assert.match(filterNoteOf(query({ filter: "notRaised" })), /No raised invoice/);
});

// ───────── the panel, state by state ─────────

const renderPanel = async (data, over = {}) => {
  const { RaisedBreakdownPanel } = await load(PANEL);
  return renderToStaticMarkup(
    h(RaisedBreakdownPanel, {
      titleId: "t1", monthLabel: "October 2026", filterNote: "", cardTotalINR: data.totalINR ?? 0, isAllMonths: false, data, isOpen: () => false, allOpen: false,
      onToggle() {}, onToggleAll() {}, onClose() {}, onRetry() {}, onLoadMore() {}, ...over,
    })
  );
};
const ready = (projects, over = {}) => {
  const p = pageOf(projects);
  return { status: "ready", error: null, totalINR: p.totalINR, invoiceCount: p.invoiceCount, projectCount: p.projectCount, projects, hasMore: false, loadingMore: false, moreError: null, ...over };
};

test("header: the title, the period, the total prominently, and the counts — then a hierarchy of total → project totals → invoices that adds up", async () => {
  const data = ready([
    project(3, [inv("TRK-C-OCT", { status: "Paid", amountINR: 333000, invoiceDate: "2026-10-05" })]),
    project(1, [inv("I-3", { status: "Paid", amountINR: 100000, invoiceDate: "2026-10-28" }), inv("I-2", { amountINR: 120000, invoiceDate: "2026-10-15" }), inv("I-1", { status: "PartiallyPaid", amountINR: 80000, invoiceDate: "2026-10-10" })]),
  ]);
  const html = await renderPanel(data, { isOpen: () => true, allOpen: true });
  assert.match(html, /role="heading" aria-level="2"[^>]*>Raised Invoice Amount Breakdown</, "titled; a role=heading, not an <h2>, so the app's global dark-mode h2 size cannot change it");
  assert.match(html, /data-bd-month[^>]*>October 2026</);
  assert.match(html, /data-bd-total[^>]*>₹[\s ]?6,33,000\.00</, "the total, prominently: 3,33,000 + 3,00,000");
  assert.match(flat(html), /4 invoices · 2 projects/);
  assert.match(html, /aria-labelledby|id="t1"/);
  const row = (pr) => {
    const a = html.indexOf(`data-bd-project="${pr}"`);
    const b = html.indexOf('data-bd-project="', a + 10); // up to the next project: the invoices are nested inside their project
    return html.slice(a, b === -1 ? undefined : b);
  };
  assert.match(flat(row("PR-1")), /PR-1 Client 1 · Title 1 ₹ ?3,00,000\.00 3 invoices/, "project: PR, client · title, total, count");
  assert.match(flat(row("PR-3")), /1 invoice/, "singular");
  const invoices = [...html.matchAll(/data-bd-invoice="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(invoices, ["TRK-C-OCT", "I-3", "I-2", "I-1"], "the server's order: project by project, newest invoice first");
  assert.match(flat(row("PR-1")), /I-3 28 Oct 2026 Paid ₹ ?1,00,000\.00/);
  assert.match(flat(row("PR-1")), /I-2 15 Oct 2026 Raised ₹ ?1,20,000\.00/);
  assert.match(flat(row("PR-1")), /I-1 10 Oct 2026 Partially Paid ₹ ?80,000\.00/, "the portal's own status words");
  assert.equal(/Pending Approval|Draft|Cancelled/.test(html), false, "only raised-class invoices are ever listed");
  const statuses = [...html.matchAll(/data-bd-status="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(statuses.sort(), ["Paid", "Paid", "PartiallyPaid", "Raised"]);
});

test("collapsed by default: a project shows its total and count; its invoices appear only when expanded; every toggle is a real, labelled button", async () => {
  const data = ready([project(1, [inv("A"), inv("B")]), project(2, [inv("C")])]);
  const closed = await renderPanel(data);
  assert.equal(/data-bd-invoice=/.test(closed), false, "no invoice rows while collapsed");
  assert.equal((closed.match(/aria-expanded="false"/g) ?? []).length, 2);
  assert.match(closed, /aria-controls="rb-pid-1"/);
  assert.match(closed, /data-bd-toggle-all[^>]*>Expand all</);
  const one = await renderPanel(data, { isOpen: (p) => p.projectId === "pid-2" });
  assert.deepEqual([...one.matchAll(/data-bd-invoice="([^"]+)"/g)].map((m) => m[1]), ["C"], "only the expanded project shows invoices");
  assert.match(one, /id="rb-pid-2"/, "the controlled region exists when expanded");
  const open = await renderPanel(data, { isOpen: () => true, allOpen: true });
  assert.match(open, /data-bd-toggle-all[^>]*>Collapse all</);
  assert.equal((open.match(/aria-expanded="true"/g) ?? []).length, 2);
  assert.match(open, /aria-label="Invoices of PR-1"/);
});

test("loading, error and empty states each say what is happening; the card's own total is shown at once; nothing is fabricated", async () => {
  const loading = await renderPanel({ status: "loading", error: null, totalINR: 0, invoiceCount: 0, projectCount: 0, projects: [], hasMore: false, loadingMore: false, moreError: null }, { cardTotalINR: 757000 });
  assert.match(loading, /data-bd-loading/);
  assert.match(loading, /role="status"/);
  assert.match(loading, /Loading the invoices behind this total/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /data-bd-total[^>]*>₹[\s ]?7,57,000\.00</, "the card's figure, until the breakdown answers");
  assert.match(flat(loading), /Loading invoices…/);
  assert.equal(/data-bd-toggle-all|data-bd-project=/.test(loading), false);

  const errored = await renderPanel({ status: "error", error: "The server could not build the breakdown.", totalINR: 0, invoiceCount: 0, projectCount: 0, projects: [], hasMore: false, loadingMore: false, moreError: null }, { cardTotalINR: 757000 });
  assert.match(errored, /role="alert" data-bd-error/);
  assert.match(flat(errored), /Couldn’t load the breakdown The server could not build the breakdown\. Try again/);
  assert.match(flat(errored), /Could not load the invoices/);
  assert.equal(/data-bd-project=/.test(errored), false, "no partial list is shown after a failure");

  const empty = await renderPanel(ready([]), { cardTotalINR: 0 });
  assert.match(empty, /data-bd-empty/);
  assert.match(flat(empty), /No raised invoices No Raised, Partially Paid or Paid invoice is dated in October 2026\. Drafts, cancelled invoices and invoice requests are not included\./);
  assert.match(flat(empty), /0 invoices · 0 projects/);
  assert.equal(/data-bd-toggle-all/.test(empty), false, "nothing to expand");
  const emptyFiltered = await renderPanel(ready([]), { cardTotalINR: 0, filterNote: "Filtered by search “zzz” — the same filters as the list." });
  assert.match(flat(emptyFiltered), /is dated in October 2026 for these filters\./);
  const emptyAll = await renderPanel(ready([]), { cardTotalINR: 0, isAllMonths: true, monthLabel: "All months" });
  assert.match(flat(emptyAll), /is dated in any month\./);
});

test("an out-of-date card is noticed: when the loaded total differs from the card's, the panel says so and offers Refresh; it is silent when they agree", async () => {
  const data = ready([project(1, [inv("A", { amountINR: 758000 })])]);
  const stale = await renderPanel(data, { cardTotalINR: 757000, onRefresh() {} });
  assert.match(stale, /role="status" data-bd-stale/);
  assert.match(flat(stale), /The invoices changed since this page loaded — the card shows ₹ ?7,57,000\.00\./);
  assert.match(flat(stale), /Refresh/);
  const noRefresh = await renderPanel(data, { cardTotalINR: 757000 });
  assert.equal(/<button[^>]*>[^<]*<svg[^>]*><\/svg> Refresh/.test(noRefresh), false, "no Refresh action without a handler");
  const agree = await renderPanel(ready([project(1, [inv("A", { amountINR: 757000 })])]), { cardTotalINR: 757000, onRefresh() {} });
  assert.equal(/data-bd-stale/.test(agree), false);
});

test("paging: 'Show more projects' with a count while more exist, a disabled state while loading, an error that keeps what is shown; none when everything is loaded", async () => {
  const some = ready([project(1, [inv("A")])], { hasMore: true, projectCount: 78 });
  const html = await renderPanel(some);
  assert.match(flat(html), /Show more projects 1 of 78 projects shown/);
  assert.equal(/<button[^>]*disabled[^>]*>Show more projects/.test(html), false);
  const loadingMore = await renderPanel({ ...some, loadingMore: true });
  assert.match(loadingMore, /<button[^>]*disabled[^>]*>Loading…</);
  const failedMore = await renderPanel({ ...some, moreError: "Try later" });
  assert.match(failedMore, /role="alert"[^>]*>Try later</);
  assert.match(failedMore, /data-bd-project="PR-1"/, "the projects already loaded stay");
  const all = await renderPanel(ready([project(1, [inv("A")])]));
  assert.equal(/data-bd-more/.test(all), false);
});

test("filters are named; a long invoice reference or project name never breaks the layout; cancelled lines and a missing date are said plainly", async () => {
  const longNo = `TRK-${"VERY-LONG-INVOICE-REFERENCE-".repeat(6)}END`;
  const longTitle = "An extremely long project title ".repeat(8).trim();
  const data = ready([
    project(1, [inv(longNo, { amountINR: 1500 }), inv("MULTI", { amountINR: 15000, cancelledLineCount: 1 }), inv("UNDATED", { amountINR: 77, invoiceDate: null })], { projectTitle: longTitle, client: "Client With A Name That Keeps Going And Going" }),
  ]);
  const html = await renderPanel(data, { isOpen: () => true, allOpen: true, filterNote: "Filtered by search “TRK” — the same filters as the list." });
  assert.match(flat(html), /Filtered by search “TRK” — the same filters as the list\./);
  const invoiceNo = html.slice(html.indexOf("data-bd-invoice-no"), html.indexOf("</span>", html.indexOf("data-bd-invoice-no")));
  assert.ok(html.includes(`title="${longNo}"`), "the full reference stays available on hover");
  assert.match(html, /\[overflow-wrap:anywhere\][^>]*title="TRK-VERY-LONG/, "an unbroken reference wraps instead of widening the row");
  assert.ok(invoiceNo.includes(longNo));
  assert.match(html, /class="[^"]*truncate[^"]*" title="PR-1"/, "PR number truncates");
  assert.match(html, /truncate" title="Client With A Name That Keeps Going And Going · An extremely long project title/, "client · title truncates and keeps a tooltip");
  assert.ok((html.match(/min-w-0/g) ?? []).length >= 4, "flex children may shrink");
  assert.match(flat(html), /1 cancelled line not counted/);
  assert.match(flat(html), /No usable invoice date/);
  assert.equal(/overflow-x/.test(html), false, "no horizontal scroll container anywhere in the panel");
});

// ───────── the card ─────────

test("the card: an ordinary card is untouched; with an action it is ONE button with the same look, a quiet 'View breakdown' line, a chevron and the right ARIA", async () => {
  const { StatCard } = await load("/src/pages/InvoiceTracker/StatCard.tsx");
  const { IndianRupee } = await import("lucide-react");
  const props = { label: "Raised invoice amount", value: "₹7,57,000.00", hint: "Invoices dated in October 2026", accent: "emerald", icon: IndianRupee };
  const plain = renderToStaticMarkup(h(StatCard, props));
  assert.match(plain, /^<div[^>]*data-stat="Raised invoice amount"/, "no action → the same non-interactive card as before");
  assert.equal(/<button|data-card-action|data-card-chevron|aria-haspopup/.test(plain), false);
  const actionable = renderToStaticMarkup(h(StatCard, { ...props, onActivate() {}, actionLabel: "View breakdown", expanded: false }));
  assert.match(actionable, /^<button type="button"[^>]*data-stat="Raised invoice amount"/);
  assert.match(actionable, /aria-haspopup="dialog"/);
  assert.match(actionable, /aria-expanded="false"/);
  assert.match(actionable, /data-card-action[^>]*>View breakdown</);
  assert.match(actionable, /data-card-chevron/);
  assert.match(actionable, /focus-visible:ring-2/, "a visible keyboard focus state");
  assert.match(actionable, /hover:border-\[var\(--nu-accent\)\]/, "a subtle hover state");
  assert.equal(/<div/.test(actionable.replace(/^<button[^>]*>/, "")), false, "valid HTML: nothing but phrasing content inside the button");
  assert.match(actionable, /data-value[^>]*>₹7,57,000\.00</, "the prominent total is unchanged");
  assert.match(renderToStaticMarkup(h(StatCard, { ...props, onActivate() {}, actionLabel: "View breakdown", expanded: true })), /aria-expanded="true"/);
  // the other cards keep exactly the card classes
  const strip = (s) => s.replace(/<[^>]+class="([^"]*)"[^>]*data-stat[^>]*>[^]*/, "$1");
  assert.ok(strip(plain).includes("rounded-xl p-4 flex items-center gap-3 shadow-sm"));
  assert.ok(strip(actionable).includes("rounded-xl p-4 flex items-center gap-3 shadow-sm"), "same card chrome");
});

test("the summary cards: the Raised invoice amount card opens the breakdown when the page supplies the list's query; without it nothing is clickable", async () => {
  const { TrackerSummaryCards } = await load("/src/pages/InvoiceTracker/InvoiceTracker.tsx");
  const zero = { raised: 0, partiallyPaid: 0, paid: 0, draft: 0, cancelled: 0 };
  const data = {
    month: "2026-10", items: [], page: 1, pageSize: 25, total: 0, totalPages: 1,
    summary: {
      projectCount: 4, projectsRaised: 4, projectsAwaitingApproval: 1, recordCount: 13, invoiceCount: 9, requestCount: 4, invoicesRaised: 6, raisedAmountINR: 757000, byStatus: { ...zero, raised: 4, paid: 2, draft: 3 },
      requests: { open: 3, completed: 1 }, pendingApproval: { count: 3, amountINR: null, note: "n" }, collected: { amountINR: 433000, basis: "inferred_from_paid_status", paidInvoiceCount: 2, partiallyPaidExcludedCount: 0, needsReviewCount: 0, note: "n" },
      outstanding: { scope: "selected_month", knownAmountINR: 324000, invoiceCount: 4, balanceNotRecordedCount: 0 },
    },
  };
  const withQuery = renderToStaticMarkup(h(TrackerSummaryCards, { data, query: query(), refreshKey: 0 }));
  assert.equal((withQuery.match(/data-actionable="true"/g) ?? []).length, 1, "exactly one card is actionable");
  const from = withQuery.indexOf('data-stat="Raised invoice amount"');
  const card = withQuery.slice(from, withQuery.indexOf("</button>", from));
  assert.match(card, /data-actionable="true"/);
  assert.match(flat(card), /Raised invoice amount ₹ ?7,57,000\.00 Invoices dated in October 2026 View breakdown/);
  const without = renderToStaticMarkup(h(TrackerSummaryCards, { data }));
  assert.equal(/data-actionable|View breakdown/.test(without), false, "no query → the same plain cards as before");
  assert.match(without, /data-stat="Raised invoice amount"[^]*?₹[\s ]?7,57,000\.00/, "…and the same figure");
  for (const label of ["Workflow records", "Raised invoices", "Pending approval amount", "Amount collected", "Invoice status"]) assert.equal(new RegExp(`<button[^>]*data-stat="${label}"`).test(withQuery), false, `${label} is not interactive`);
});

// ───────── the dialog shell and the wiring ─────────

test("the dialog is closed (renders nothing) until opened; its shell is a modal with Esc, Tab trapping, scroll lock and focus handled", async () => {
  const { RaisedBreakdownDialog } = await load(PANEL);
  assert.equal(renderToStaticMarkup(h(RaisedBreakdownDialog, { open: false, titleId: "t", onClose() {} }, h("p", null, "x"))), "", "closed = nothing in the page");
  const text = src("pages/InvoiceTracker/RaisedBreakdown.tsx");
  assert.match(text, /role="dialog"/);
  assert.match(text, /aria-modal="true"/);
  assert.match(text, /aria-labelledby=\{titleId\}/);
  assert.match(text, /e\.key === "Escape"/, "Esc closes");
  assert.match(text, /e\.key !== "Tab"/, "Tab is handled");
  assert.match(text, /e\.shiftKey/, "…in both directions");
  assert.match(text, /document\.body\.style\.overflow = "hidden"/, "the page behind does not scroll");
  assert.match(text, /document\.body\.style\.overflow = scrollLock/, "…and scrolls again afterwards");
  assert.match(text, /openerRef\.current\?\.focus/, "focus returns to what opened it");
  assert.match(text, /requestAnimationFrame\(\(\) => panelRef\.current\?\.querySelector<HTMLElement>\("\[data-autofocus\]"\)/, "initial focus on the Close button, one frame later so a re-attached portal cannot lose it");
  assert.match(text, /cancelAnimationFrame\(focusFrame\)/);
  assert.match(text, /onClick=\{onClose\} data-bd-backdrop/, "a backdrop click closes");
  assert.match(text, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/, "…but a click inside does not");
  assert.match(text, /data-autofocus/);
  assert.match(text, /aria-label="Close breakdown"/);
  assert.match(text, /import \{ Portal \} from "..\/..\/components\/ui\/Portal"/, "the app's own overlay portal");
  assert.match(text, /z-\[9600\]/, "the same layer as the app's confirmation dialogs");
});

test("responsive: a centred panel on laptops, a bottom sheet on phones; its body scrolls inside it; the page behind never has to", () => {
  const text = src("pages/InvoiceTracker/RaisedBreakdown.tsx");
  assert.match(text, /items-end sm:items-center/, "bottom-aligned on phones, centred from sm");
  assert.match(text, /rounded-t-\[var\(--nu-radius-lg\)\] sm:rounded-\[var\(--nu-radius-lg\)\]/, "sheet corners on phones, a card from sm");
  assert.match(text, /w-full sm:max-w-\[40rem\]/);
  assert.match(text, /max-h-\[88dvh\] sm:max-h-\[85vh\]/, "never taller than the screen (dvh accounts for mobile browser bars)");
  assert.match(text, /flex flex-col overflow-hidden/);
  assert.match(text, /min-h-0 flex-1 overflow-y-auto overscroll-contain/, "only the list scrolls; header and toolbar stay put");
  assert.doesNotMatch(text, /overflow-x-(auto|scroll)/, "no horizontal scrolling");
  assert.match(text, /motion-reduce:/, "motion respects the user's setting");
  assert.match(text, /\[overflow-wrap:anywhere\]/);
  assert.match(text, /tabular-nums/, "amounts align");
});

test("the breakdown shows the server's figures and keeps nothing of its own: no arithmetic on amounts, no browser storage, one request per (month, filters, refresh)", () => {
  for (const file of ["pages/InvoiceTracker/RaisedBreakdown.tsx", "pages/InvoiceTracker/useRaisedBreakdown.ts", "pages/InvoiceTracker/raisedBreakdownLogic.ts"]) {
    const text = src(file);
    assert.doesNotMatch(text, /\.reduce\(|Σ|totalINR\s*[+]=|amountINR\s*[+]=|\bsum\b/i, `${file}: no summing in the browser`);
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB/, `${file}: no browser storage`);
  }
  const hook = src("pages/InvoiceTracker/useRaisedBreakdown.ts");
  assert.match(hook, /if \(!enabled \|\| answered\) return;/, "fetches only while open, and only if this request has no answer yet");
  assert.match(hook, /active = false; \/\/ anything still in flight is now stale/, "a late answer for an old request is dropped");
  assert.match(hook, /fetchRaisedBreakdown\(\{ month, page: 1, pageSize: PAGE_SIZE, search, projectStatus, filter \}\)/, "asks for exactly the list's month and filters");
  assert.match(hook, /moreInFlight\.current/, "a double click on 'Show more' makes one request");
  const service = src("services/invoiceTrackerService.ts");
  assert.match(service, /apiClient\.get<RaisedBreakdownPage>\(`\/invoice-tracker\/raised-breakdown\?\$\{trackerQueryString\(q\)\}`\)/, "the same query string as the list");
});

test("the page hands the card the exact month and filters the list is showing, a refresh key and a way to refresh; closing returns to the same page state", () => {
  const page = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  assert.match(page, /<TrackerSummaryCards data=\{data\} query=\{\{ month, search, projectStatus, filter \}\} refreshKey=\{refreshTick \+ listTick\} onRefresh=\{refresh\} \/>/);
  const card = src("pages/InvoiceTracker/RaisedBreakdown.tsx");
  assert.match(card, /const close = useCallback\(\(\) => \{\n\s*setOpen\(false\);\n\s*setOverrides\(new Map\(\)\);/, "closing only closes: the page, its filters and its data are untouched; the next opening starts collapsed");
  assert.doesNotMatch(card, /navigate\(|setSearchParams|window\.location|history\./, "the dialog never changes the URL or the page state");
});
