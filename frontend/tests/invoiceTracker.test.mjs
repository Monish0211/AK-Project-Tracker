// Invoice Tracker (Oct 2026) — formatting rules, the presentational pieces rendered server-side (no browser), the
// sidebar / route wiring, the shared Repository badge rule, and the project-context loader.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
let React;
let renderToStaticMarkup;
let MemoryRouter;
const store = new Map();
before(async () => {
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
  globalThis.sessionStorage = globalThis.localStorage;
  // Saving the mirror announces "pmo:data-changed" on window; a no-op stand-in is enough here.
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
  ({ MemoryRouter } = await import("react-router-dom"));
});
after(() => vite?.close());

const h = (...a) => React.createElement(...a);
const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");
const FMT = "/src/pages/InvoiceTracker/trackerFormat.ts";

test("month helpers: current month is the India calendar month; only real months are valid; labels read naturally", async () => {
  const { currentMonthIST, isValidMonth, formatMonthLabel } = await load(FMT);
  assert.equal(currentMonthIST(new Date("2026-10-20T08:00:00Z")), "2026-10");
  assert.equal(currentMonthIST(new Date("2026-10-31T19:00:00Z")), "2026-11", "19:00 UTC on the 31st is already 00:30 IST on 1 November");
  assert.equal(currentMonthIST(new Date("2026-12-31T18:29:00Z")), "2026-12");
  assert.equal(currentMonthIST(new Date("2026-12-31T18:30:00Z")), "2027-01", "year roll-over at IST midnight");
  for (const ok of ["2026-03", "2000-01", "2100-12"]) assert.equal(isValidMonth(ok), true, ok);
  for (const bad of ["2026-13", "2026-00", "2026-3", "", null, undefined, "1999-12", "2101-01", "2026-03-01", "abcd-ef"]) assert.equal(isValidMonth(bad), false, String(bad));
  assert.equal(formatMonthLabel("2026-03"), "March 2026");
  assert.equal(formatMonthLabel("2026-12"), "December 2026");
});

test("dates and instants: invoice dates are date-only (no zone shift); event times are exact instants shown in IST", async () => {
  const { formatDateOnly, formatInstant } = await load(FMT);
  assert.equal(formatDateOnly("2026-03-01"), "01 Mar 2026");
  assert.equal(formatDateOnly("2026-03-31T00:00:00.000Z"), "31 Mar 2026");
  assert.equal(formatInstant("2026-10-20T10:15:00.000Z"), "20 Oct 2026, 3:45 pm IST");
  assert.equal(formatInstant("2026-10-20T18:35:00.000Z"), "21 Oct 2026, 12:05 am IST", "crosses midnight in IST");
  assert.equal(formatInstant("nonsense"), "nonsense");
});

test("event wording uses the recorded previous and new status, with the portal's own status labels", async () => {
  const { describeEvent, statusLabel, sourceLabel } = await load(FMT);
  assert.equal(statusLabel("Raised"), "Raised / Submitted");
  assert.equal(statusLabel("PartiallyPaid"), "Partially Paid");
  assert.equal(statusLabel(null), "—");
  const e = (eventType, fromStatus, toStatus, lineCount = 1) => describeEvent({ eventType, fromStatus, toStatus, lineCount });
  assert.equal(e("CREATED", null, "Raised"), "Created as Raised / Submitted");
  assert.equal(e("STATUS_CHANGED", "Raised", "PartiallyPaid"), "Raised / Submitted → Partially Paid");
  assert.equal(e("STATUS_CHANGED", "PartiallyPaid", "Paid", 3), "Partially Paid → Paid · 3 lines");
  assert.equal(e("DELETED", "Paid", null), "Deleted (was Paid)");
  assert.equal(e("IMPORTED", null, "Paid"), "Imported as Paid — earlier history unknown");
  assert.equal(sourceLabel("invoice_update"), "Invoice edited");
  assert.equal(sourceLabel("something_new"), "something_new");
});

test("the request string carries only what is set (empty filters are omitted)", async () => {
  const { trackerQueryString } = await load("/src/services/invoiceTrackerService.ts");
  assert.equal(trackerQueryString({ month: "2026-03", page: 2, pageSize: 50 }), "month=2026-03&page=2&pageSize=50");
  assert.equal(trackerQueryString({ month: "2026-03", page: 1, pageSize: 25, search: "acme", projectStatus: "Active", filter: "notRaised" }), "month=2026-03&page=1&pageSize=25&search=acme&projectStatus=Active&filter=notRaised");
  assert.equal(trackerQueryString({ month: "2026-03", page: 1, pageSize: 25, search: "", filter: "all" }), "month=2026-03&page=1&pageSize=25");
});

const event = (over = {}) => ({ eventType: "STATUS_CHANGED", fromStatus: "Raised", toStatus: "Paid", actorName: "Asha", actorUserId: "u1", source: "invoice_update", occurredAt: "2026-10-20T10:15:00.000Z", lineCount: 1, ...over });
const invoice = (over = {}) => ({
  key: "INV-1", invoiceNo: "INV-1", createdAt: "2026-03-06T06:00:00.000Z", createdMonth: "2026-03", invoiceDate: "2026-03-01", raisedAt: "2026-03-06T06:00:01.000Z",
  raisedInPeriod: false, amountINR: 125000, currency: "INR", originalAmount: null, status: "Raised", mixedLineStatuses: false, paymentStatus: "Awaiting payment",
  financials: { amountINR: 125000, amountPaidINR: 0, paidBasis: "none_yet", outstandingINR: 125000, balance: "full", flags: [] },
  lines: [{ id: "l1", quantityItemId: "q1", activity: "Engineering", status: "Raised", amountINR: 125000 }],
  recordedInPortal: { at: "2026-01-11T00:00:00.000Z", by: "Direct Entry" }, hasRecordedHistory: true, timeline: [event()], invoiceRequest: null, ...over,
});
const request = (over = {}) => ({
  id: "r1", ref: "R1AB23CD", status: "Open", label: "Invoice Requested", createdAt: "2026-03-03T06:00:00.000Z", createdMonth: "2026-03", requestedBy: "Priya", assignedTo: "Asha", amountNote: null, notes: null, fulfilledByInvoiceNo: null, ...over,
});
// A chain payload as the server builds it: the headline (latest raised invoice up to the month's end), the month's drafts, the history, the older-outstanding figure.
const RAISED = ["Raised", "Submitted", "PartiallyPaid", "Paid"];
const chainData = (invoices, requests = [], month = "2026-03", order = undefined, previousInvoices = [], undatedInvoiceCount = 0, over = {}) => {
  const all = [...invoices, ...previousInvoices].filter((i) => i.invoiceDate);
  const raised = all.filter((i) => RAISED.includes(i.status)).sort((a, b) => (b.invoiceDate < a.invoiceDate ? -1 : b.invoiceDate > a.invoiceDate ? 1 : 0));
  const latest = month === "all" ? null : (raised[0] ?? null);
  const drafts = month === "all" ? [] : invoices.filter((i) => i.status === "Draft" && i.invoiceDate);
  const history = month === "all" ? [] : all.filter((i) => i !== latest && !drafts.includes(i)).sort((a, b) => (b.invoiceDate < a.invoiceDate ? -1 : b.invoiceDate > a.invoiceDate ? 1 : 0));
  return {
    month, project: { id: "p1", prNo: "PR-1", client: "C", projectTitle: "T", projectStatus: "Active" }, invoices, previousInvoices, undatedInvoiceCount, requests,
    latestRaisedKey: latest?.key ?? null, latestRaisedInMonth: latest ? latest.invoiceDate.slice(0, 7) === month : null,
    draftKeys: drafts.map((i) => i.key), historyKeys: history.map((i) => i.key),
    olderOutstanding: { count: 0, amountINR: 0, knownAmountINR: 0, unknownCount: 0, undatedCount: 0, keys: [] },
    order: order ?? [...invoices.map((i) => ({ kind: "invoice", id: i.key })), ...requests.map((r) => ({ kind: "request", id: r.id }))],
    ...over,
  };
};

test("timeline: events oldest-first with previous → new, actor, IST time and source; no-history invoices say so and invent nothing", async () => {
  const { InvoiceTimeline } = await load("/src/pages/InvoiceTracker/InvoiceTimeline.tsx");
  const withHistory = renderToStaticMarkup(h(InvoiceTimeline, { invoice: invoice({ timeline: [event({ eventType: "CREATED", fromStatus: null, toStatus: "Raised", source: "invoice_create" }), event()] }) }));
  assert.ok(withHistory.indexOf("Created as Raised / Submitted") < withHistory.indexOf("Raised / Submitted → Paid"), "order as given (oldest first)");
  assert.match(withHistory, /Asha/);
  assert.match(withHistory, /20 Oct 2026, 3:45 pm IST/);
  assert.match(withHistory, /Invoice created/);
  assert.equal(/No recorded history/.test(withHistory), false);
  const none = renderToStaticMarkup(h(InvoiceTimeline, { invoice: invoice({ hasRecordedHistory: false, timeline: [] }) }));
  assert.match(none, /No recorded history/);
  assert.match(none, /Entered in the portal 11 Jan 2026 by Direct Entry/);
  assert.match(none, /not captured/);
  assert.equal(/data-event=/.test(none), false, "no event rows are fabricated");
  const linked = renderToStaticMarkup(h(InvoiceTimeline, { invoice: invoice({ invoiceRequest: { id: "r1", submittedAt: "2026-02-01T05:00:00.000Z", submittedBy: "Priya" } }) }));
  assert.match(linked, /Invoice request submitted 01 Feb 2026, 10:30 am IST by Priya — fulfilled by this invoice/);
});

test("chain (All history): one block per invoice (never repeating the project), payment kept separate from status, actions follow permissions", async () => {
  const { InvoiceChainView } = await load("/src/pages/InvoiceTracker/InvoiceChain.tsx");
  const five = [1, 2, 3, 4, 5].map((n) => invoice({ key: `INV-${n}`, invoiceNo: `INV-${n}`, lines: [{ id: `l${n}`, quantityItemId: "q1", activity: "A", status: "Raised", amountINR: 100 }] }));
  const render = (canEdit, canDelete, invoices = five) => renderToStaticMarkup(h(InvoiceChainView, { data: chainData(invoices, [], "all"), loading: false, canEdit, canDelete, onAction() {} }));
  const full = render(true, true);
  assert.equal((full.match(/data-invoice=/g) ?? []).length, 5, "five invoices → five blocks");
  assert.equal((full.match(/PR-1/g) ?? []).length, 0, "the project row is not repeated inside its chain");
  assert.equal((full.match(/aria-label="View invoice INV-\d"/g) ?? []).length, 5);
  assert.equal((full.match(/aria-label="Edit invoice INV-\d"/g) ?? []).length, 5);
  assert.equal((full.match(/aria-label="Delete invoice INV-\d"/g) ?? []).length, 5);
  assert.match(full, /Payment: Awaiting payment/);
  assert.match(full, /Raised \/ Submitted/);
  assert.equal((full.match(/Workflow created/g) ?? []).length, 5, "each invoice shows its workflow creation date");
  assert.match(full, /06 Mar 2026, 11:30 am IST/, "creation instant shown in India time");
  assert.equal((full.match(/data-month-badge/g) ?? []).length, 5, "All history names the month each invoice was created in");
  const viewOnly = render(false, false);
  assert.equal(/aria-label="(Edit|Delete) invoice/.test(viewOnly), false, "no Edit / Delete without the rights");
  assert.equal((viewOnly.match(/aria-label="View invoice/g) ?? []).length, 5, "View is always available");
  const editOnly = render(true, false);
  assert.ok(/aria-label="Edit invoice/.test(editOnly) && !/aria-label="Delete invoice/.test(editOnly), "Edit without Delete");
  const multi = renderToStaticMarkup(h(InvoiceChainView, { data: chainData([invoice({ mixedLineStatuses: true, status: "Raised", lines: [{ id: "a", quantityItemId: "q1", activity: "Engineering", status: "Raised", amountINR: 100 }, { id: "b", quantityItemId: "q2", activity: "Drawings", status: "Draft", amountINR: 200 }] })], [], "all"), loading: false, canEdit: true, canDelete: true, onAction() {} }));
  assert.ok(multi.includes("Engineering") && multi.includes("Drawings"), "a multi-line invoice lists its lines");
  assert.equal((multi.match(/aria-label="Edit invoice INV-1"/g) ?? []).length, 2, "each line has its own actions, as in Invoice History");
  assert.match(multi, /Lines have different statuses/);
  const usd = renderToStaticMarkup(h(InvoiceChainView, { data: chainData([invoice({ currency: "USD", originalAmount: 1500 })], [], "all"), loading: false, canEdit: false, canDelete: false, onAction() {} }));
  assert.match(usd, /USD 1,500\.00/);
});

test("chain actions report exactly which line was chosen", async () => {
  const { InvoiceChainView } = await load("/src/pages/InvoiceTracker/InvoiceChain.tsx");
  const calls = [];
  const tree = InvoiceChainView({ data: chainData([invoice()]), loading: false, canEdit: true, canDelete: true, onAction: (a) => calls.push(a) });
  const buttons = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n.type === "function") {
      try { return walk(n.type(n.props)); } catch { /* hooks-only components */ }
    }
    if (n.type === "button") buttons.push(n);
    walk(n.props?.children);
  })(tree);
  assert.equal(buttons.length, 3);
  buttons.forEach((b) => b.props.onClick());
  assert.deepEqual(calls.map((c) => [c.mode, c.projectId, c.quantityItemId, c.lineId, c.invoiceNo]), [
    ["view", "p1", "q1", "l1", "INV-1"], ["edit", "p1", "q1", "l1", "INV-1"], ["delete", "p1", "q1", "l1", "INV-1"],
  ]);
});

const zero = { raised: 0, partiallyPaid: 0, paid: 0, draft: 0, cancelled: 0 };
const records = (over = {}) => ({ recordCount: 0, invoiceCount: 0, byStatus: { ...zero }, raisedInvoiceCount: 0, raisedInPeriodCount: 0, raisedAmountINR: 0, draftInvoiceCount: 0, cancelledInvoiceCount: 0, openRequestCount: 0, completedRequestCount: 0, ...over });
const row = (n, over = {}) => ({
  id: `p${n}`, prNo: `PR-${n}`, client: `Client ${n}`, projectTitle: `Title ${n}`, projectStatus: "Active", workOrderValueINR: 2_000_000, pendingDueINR: 500_000, hasOpenInvoiceRequest: false,
  latestRaised: null, olderOutstanding: { count: 0, amountINR: 0, knownAmountINR: 0, unknownCount: 0, undatedCount: 0 }, records: records(), ...over,
});
const summary = (over = {}) => ({
  projectCount: 5, projectsRaised: 3, projectsAwaitingApproval: 1, recordCount: 13, invoiceCount: 11, requestCount: 2, invoicesRaised: 8, raisedAmountINR: 7950,
  byStatus: { raised: 6, partiallyPaid: 1, paid: 1, draft: 2, cancelled: 1 }, requests: { open: 1, completed: 1 },
  pendingApproval: { count: 1, amountINR: null, note: "n" }, collected: { amountINR: 3000, basis: "inferred_from_paid_status", paidInvoiceCount: 1, partiallyPaidExcludedCount: 1, needsReviewCount: 0, note: "n" },
  outstanding: { scope: "selected_month", knownAmountINR: 2950, invoiceCount: 7, balanceNotRecordedCount: 1 }, ...over,
});
const page = (items, over = {}) => ({ month: "2026-03", items, page: 1, pageSize: 25, total: items.length, totalPages: 1, summary: summary(), ...over });

test("table: expanding shows the chain under that project only; S. No. continues across pages", async () => {
  const { TrackerTable } = await load("/src/pages/InvoiceTracker/InvoiceTracker.tsx");
  const items = [row(26), row(27)];
  const html = renderToStaticMarkup(h(MemoryRouter, null, h(TrackerTable, { data: page(items, { page: 2, pageSize: 25, total: 52, totalPages: 3 }), month: "2026-03", expanded: new Set(["p27"]), onToggle() {}, renderChain: (id) => `CHAIN-OF-${id}` })));
  assert.equal((html.match(/CHAIN-OF-/g) ?? []).length, 1);
  assert.ok(html.includes("CHAIN-OF-p27") && !html.includes("CHAIN-OF-p26"));
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Hide records/);
  assert.ok(/>26</.test(html) && />27</.test(html), "page 2 starts at S. No. 26");
});

test("summary cards show the period figures from the server; unrecorded amounts say so instead of showing a number", async () => {
  const { TrackerSummaryCards } = await load("/src/pages/InvoiceTracker/InvoiceTracker.tsx");
  const html = renderToStaticMarkup(h(TrackerSummaryCards, { data: page([]) }));
  assert.match(html, /data-stat="Workflow records"[^]*?>13</);
  assert.match(html, /11 invoices · 2 requests · 5 projects/);
  assert.match(html, /data-stat="Raised invoices"[^]*?>8</);
  assert.match(html, /never Draft, Cancelled or requests/);
  assert.match(html, /data-stat="Raised invoice amount"[^]*?₹[\s\u202f]?7,950/);
  assert.match(html, /Invoices dated in March 2026/, "the amount is described by invoice date, not creation date");
  assert.match(html, /data-stat="Pending approval amount"[^]*?Not recorded/);
  assert.match(html, /1 open invoice request · requests carry no amount/);
  assert.match(html, /data-stat="Amount collected"[^]*?₹[\s\u202f]?3,000\.00/, "Amount collected is a number: the Paid invoices at their full amount");
  assert.match(html, /Inferred from Paid status — no payments are recorded: 1 Paid invoice at full amount/, "…and says plainly that it is inferred, not recorded");
  assert.match(html, /1 Partially Paid not included \(amount not recorded\)/, "Partially Paid invoices are left out, with the reason");
  assert.equal(/Paid need review/.test(html), false, "no review note when nothing is contradicted");
  const review = renderToStaticMarkup(h(TrackerSummaryCards, { data: page([], { summary: summary({ collected: { amountINR: 0, basis: "inferred_from_paid_status", paidInvoiceCount: 0, partiallyPaidExcludedCount: 0, needsReviewCount: 2, note: "n" } }) }) }));
  assert.match(review, /data-stat="Amount collected"[^]*?₹[\s\u202f]?0\.00/);
  assert.match(review, /2 Paid need review/, "Paid invoices the data contradicts are surfaced, not summed");
  assert.match(html, /Outstanding · invoices dated in this month/, "the scope of the outstanding figure is named");
  assert.match(html, /₹[\s\u202f]?2,950/);
  assert.match(html, /1 with balance not recorded/);
  assert.match(html, /6 · 1 · 1/);
  assert.match(html, /Draft 2, Cancelled 1/);
  assert.match(html, /requests open 1, completed 1/);
  assert.equal(/₹[\s\u202f]?0\.00[^]*?Pending approval/.test(html), false);
  const all = renderToStaticMarkup(h(TrackerSummaryCards, { data: page([], { month: "all" }) }));
  assert.match(all, /Outstanding · invoices dated in all months/);
  assert.match(all, /data-scope="all"/);
});

test("the Repository's invoiced-share badge is unchanged and still used only by Project Repository; the Tracker shows real invoice statuses instead", async () => {
  const { repositoryInvoiceSummary } = await load("/src/utils/repositoryInvoiceStatus.ts");
  assert.deepEqual(repositoryInvoiceSummary(1000, 1000), { pendingDue: 1000, invoiceStatus: "Not Started" });
  assert.deepEqual(repositoryInvoiceSummary(1000, 400), { pendingDue: 400, invoiceStatus: "Partially Paid" });
  assert.deepEqual(repositoryInvoiceSummary(1000, 0, true), { pendingDue: 0, invoiceStatus: "Paid" });
  assert.deepEqual(repositoryInvoiceSummary(1000, undefined), { pendingDue: 1000, invoiceStatus: "Not Started" }, "no server figure → nothing invoiced");
  const projects = src("pages/Projects/Projects.tsx");
  assert.match(projects, /repositoryInvoiceSummary\(p\.workOrderValueINR, p\.backendPendingDueINR, p\.backendAllInvoicesPaid === true\)/, "Project Repository uses the shared rule");
  assert.match(projects, /<RepositoryInvoiceStatusBadge status=\{status\} \/>/, "…and the shared badge");
  const tracker = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  assert.doesNotMatch(tracker, /repositoryInvoiceSummary|RepositoryInvoiceStatusBadge/, "the Tracker's status column is the invoices' own statuses, not a billing-progress badge");
  assert.match(tracker, /LatestInvoiceCell/);
  assert.doesNotMatch(tracker, /ProjectStatusChips/, "no chip per historical status in the project row");
});

test("sidebar, route, breadcrumb and title: the entry reuses the Invoices module; the route is lazy and gated by it", async () => {
  const sidebar = src("components/Sidebar/Sidebar.tsx");
  assert.match(sidebar, /\{ label: "Invoice Tracker", module: "Invoices", to: "\/invoice-tracker", icon: Receipt \}/);
  assert.match(sidebar, /hasModuleAccess\(user, item\.module \?\? item\.label\)/);
  const layout = src("layouts/MainLayout.tsx");
  assert.match(layout, /lazy\(\(\) => import\("\.\.\/pages\/InvoiceTracker\/InvoiceTracker"\)\)/);
  assert.match(layout, /path="\/invoice-tracker"\s+element=\{<ModuleRoute module="Invoices"><Suspense/);
  const { getBreadcrumbs } = await load("/src/utils/breadcrumbHelpers.ts");
  assert.deepEqual(getBreadcrumbs("/invoice-tracker").map((b) => b.label), ["Dashboard", "Invoice Tracker"]);
  const { getPageTitle } = await load("/src/utils/routeHelpers.ts");
  assert.equal(getPageTitle("/invoice-tracker"), "Invoice Tracker");
  const { hasModuleAccess } = await load("/src/auth/permissions.ts");
  const userWith = (...modules) => ({ modules });
  assert.equal(hasModuleAccess(userWith("Invoices"), "Invoices"), true);
  assert.equal(hasModuleAccess(userWith("Projects"), "Invoices"), false, "no Invoices module → no entry, no route");
});

test("View / Edit / Delete from the Tracker reuse the existing interfaces and save path (no second editor)", () => {
  const host = src("pages/InvoiceTracker/InvoiceActionHost.tsx");
  assert.match(host, /InvoiceActionDrawer/, "the existing RaiseInvoiceDrawer, via the shared wrapper");
  assert.match(host, /useInvoiceLineActions\(/, "the shared save / delete path");
  assert.match(host, /title="Delete Invoice\?"/);
  assert.match(host, /Delete invoice \$\{line\.invoiceNo\}\? This cannot be undone\./, "same confirmation copy as Invoice History");
  assert.doesNotMatch(host, /apiClient|syncInvoiceLinesWithApi|\/invoice-lines/, "no API logic of its own");
  const history = src("pages/Projects/components/Invoice/InvoiceHistory.tsx");
  assert.match(history, /title="Delete Invoice\?"/);
  assert.match(history, /Delete invoice \$\{deleteTarget\?\.line\.invoiceNo \?\? ""\}\? This cannot be undone\./);
  const page = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  assert.match(page, /hasApprovalPermission\(user, "Edit Invoice"\)/);
  assert.match(page, /hasApprovalPermission\(user, "Delete Invoice"\)/);
  assert.match(page, /canMutateData\(user\)/, "Read Only never sees Edit / Delete");
});

test("loading a project for an invoice action only READS: nothing is posted, and legacy browser-cached invoices are never ingested", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectInvoiceContext } = await load("/src/services/invoiceTrackerService.ts");
  // A browser mirror holding legacy invoice lines the backend does not have — exactly what loadInvoiceForProject() would ingest.
  store.set("projects", JSON.stringify([{ id: "p9", prNo: "PR-9", invoiceItems: [{ id: "q9", description: "Legacy", qty: 1, uom: "DAY", unitPrice: 1, totalPrice: 1, invoices: [line("legacy-1")] }], quantityItems: [], paymentMilestones: [] }]));
  const calls = [];
  const original = { get: apiClient.get, post: apiClient.post, put: apiClient.put, patch: apiClient.patch, delete: apiClient.delete };
  apiClient.get = async (path) => (calls.push(["GET", path]), path === "/projects/p9" ? projectDto("p9") : path.endsWith("/invoice-items") || path.endsWith("/quantity") || path.endsWith("/milestones") || path.endsWith("/resources") ? { items: [], total: 0 } : {});
  for (const m of ["post", "put", "patch", "delete"]) apiClient[m] = async (path) => (calls.push([m.toUpperCase(), path]), {});
  try {
    const project = await loadProjectInvoiceContext("p9");
    assert.equal(project.id, "p9");
    assert.deepEqual(project.invoiceItems.flatMap((i) => i.invoices), [], "the server's (empty) invoices — not the stale browser copy");
  } finally {
    Object.assign(apiClient, original);
  }
  assert.deepEqual(calls.filter(([m]) => m !== "GET"), [], "no write of any kind");
  assert.ok(calls.some(([, p]) => p === "/projects/p9/invoice-items") && calls.some(([, p]) => p === "/projects/p9/quantity") && calls.some(([, p]) => p === "/projects/p9/milestones"));
  const source = src("services/invoiceTrackerService.ts");
  assert.doesNotMatch(source, /load(Quantity|Milestones|Invoice|Expenses)ForProject/, "the auto-migrating loaders are never used");
});

function line(id) {
  return { id, invoiceNo: "LEG-1", invoiceDate: "2026-01-01", quantityBilled: 1, invoiceAmountINR: 1, status: "Raised", createdBy: "x" };
}
function projectDto(id) {
  return {
    id, poMonth: "2026-10", prCategory: "India", prNo: "PR-9", rfqNo: null, client: "C", department: "Process", domesticForeign: "Domestic", projectTitle: "T", workOrderStatus: "Received",
    projectStartDate: "2026-01-01T00:00:00.000Z", projectEndDate: null, projectStatus: "Active", workOrderValueINR: 0, pendingDueINR: 0, invoiceCurrency: "INR",
  };
}

test("chain: a month shows its records; all history tags each with its creation month; requests are records too; paid amounts are never invented", async () => {
  const { InvoiceChainView } = await load("/src/pages/InvoiceTracker/InvoiceChain.tsx");
  const render = (data) => renderToStaticMarkup(h(InvoiceChainView, { data, loading: false, canEdit: true, canDelete: true, onAction() {} }));
  const month = render(chainData([invoice({ key: "a", invoiceNo: "NEW-1" })], [request()]));
  assert.match(month, /NEW-1/);
  assert.match(month, /data-record="request"/);
  assert.match(month, /data-section="drafts-requests"/);
  assert.match(month, /invoice requests/i);
  assert.match(month, />R1AB23CD</, "a request is identified by its short reference");
  assert.match(month, /Invoice Requested/);
  assert.match(month, /Waiting for Accounts to raise the invoice/);
  assert.match(month, /03 Mar 2026, 11:30 am IST/);
  assert.match(month, /Priya · assigned to Asha/);
  assert.match(month, /data-request-amount[^>]*>Not recorded</, "a request has no numeric amount");
  assert.equal((month.match(/data-month-badge/g) ?? []).length, 0);
  const completed = render(chainData([], [request({ status: "Completed", label: "Completed", fulfilledByInvoiceNo: "INV-9", amountNote: "about 7 lakh" })]));
  assert.match(completed, /Fulfilled by invoice <strong[^>]*>INV-9<\/strong>/);
  assert.match(completed, /about 7 lakh \(free text\)/);
  assert.match(completed, /data-request-status="Completed"/);
  const all = render(chainData([invoice({ key: "a", invoiceNo: "A", createdMonth: "2026-09" }), invoice({ key: "b", invoiceNo: "B", createdMonth: "2026-03" })], [request({ createdMonth: "2026-02" })], "all"));
  assert.equal((all.match(/data-month-badge/g) ?? []).length, 3, "every record names the month it was created in");
  assert.ok(all.includes("Created September 2026") && all.includes("Created March 2026") && all.includes("Created February 2026"));
  // money honesty
  const partial = render(chainData([invoice({ status: "PartiallyPaid", paymentStatus: "Partially paid", financials: { amountINR: 125000, amountPaidINR: null, paidBasis: "not_recorded", outstandingINR: null, balance: "not_recorded", flags: ["Paid amount and balance are not recorded"] } })]));
  assert.equal((partial.match(/Not recorded/g) ?? []).length >= 2, true, "paid and outstanding both say Not recorded");
  assert.match(partial, /Review: Paid amount and balance are not recorded/);
  const paid = render(chainData([invoice({ status: "Paid", paymentStatus: "Paid", financials: { amountINR: 125000, amountPaidINR: 125000, paidBasis: "inferred_from_status", outstandingINR: 0, balance: "settled", flags: [] } })]));
  assert.match(paid, /data-money="outstanding"[^]*?₹[\s\u202f]?0\.00/, "settled by status → nothing outstanding");
  assert.match(paid, /data-money="paid"[^]*?₹[\s\u202f]?1,25,000\.00/, "Paid with nothing outstanding: Amount Paid = the invoice amount");
  assert.match(paid, /data-money="paid"[^]*?data-note="true">Inferred from Paid status</, "…labelled as inferred from the status, not a recorded payment");
  assert.match(paid, /data-money="outstanding"[^]*?data-note="true">Settled \(Paid\)</);
  const draft = render(chainData([invoice({ status: "Draft", paymentStatus: "Not applicable", raisedAt: null, financials: { amountINR: 100, amountPaidINR: null, paidBasis: "not_applicable", outstandingINR: null, balance: "not_applicable", flags: [] } })], [], "all"));
  assert.match(draft, /data-money="outstanding"[^]*?—/);
  assert.match(draft, /data-money="raised"[^]*?Not recorded/, "no recorded raise → no raised date is shown");
  assert.equal(/<select|type="radio"/.test(month), false, "the Tracker offers no way to change a status");
});

test("the three views are tabs driven by the URL, and only the monthly view has a month picker", () => {
  const text = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  for (const label of ["Monthly report", "Outstanding", "All history"]) assert.ok(src("pages/InvoiceTracker/trackerFormat.ts").includes(label), label);
  assert.match(text, /role="tablist"/);
  assert.match(text, /aria-selected=\{view === v\.value\}/);
  assert.match(text, /const month = view === "history" \? ALL_MONTHS : selectedMonth;/, "history spans every month");
  assert.match(text, /\{view === "month" && \(\s*<div[^]*?<MonthSelect value=\{selectedMonth\}/, "the month selector belongs to the monthly view only and is bound to the one selected month");
  assert.match(text, /const selectedMonth = isValidMonth\(filters\.month\) \? filters\.month : currentMonthIST\(\);/, "no month in the URL -> the CURRENT India month (never a hard-coded one)");
  assert.doesNotMatch(text, /["']2026-(0[1-9]|1[0-2])["']/, "no month is hard-coded in the page");
  assert.match(text, /view === "outstanding" \? \(\s*<OutstandingSection/, "Outstanding is its own section, separate from the month report");
  assert.match(text, /FILTER_KEYS = \["view", "month", "search", "filter", "projectStatus"\]/);
});

const outRow = (over = {}) => ({
  projectId: "p1", prNo: "PR-1", client: "Client", projectTitle: "Title", projectStatus: "Active", invoiceNo: "INV-1", createdAt: "2026-09-10T06:00:00.000Z", createdMonth: "2026-09", invoiceDate: "2026-09-10",
  status: "Raised", paymentStatus: "Awaiting payment", amountINR: 600, amountPaidINR: 0, outstandingINR: 600, balance: "full", flags: [], daysOutstanding: 41, lineCount: 1, actionLine: { id: "l1", quantityItemId: "q1" }, ...over,
});
const outPage = (items) => ({
  asOf: "2026-10-21T05:00:00.000Z", timezone: "Asia/Kolkata", items, page: 1, pageSize: 25, total: items.length, totalPages: 1,
  totals: { invoiceCount: 11, knownOutstandingINR: 6050, partiallyPaidCount: 1, partiallyPaidInvoiceAmountINR: 2000, overdue30PlusCount: 9, oldestDays: 225 },
});

test("Outstanding: unpaid invoices from every month with their ORIGINAL creation date; Partially Paid shows no invented balance", async () => {
  const { OutstandingTable, OutstandingTotalsCards } = await load("/src/pages/InvoiceTracker/OutstandingView.tsx");
  const items = [
    outRow(),
    outRow({ invoiceNo: "INV-2", status: "PartiallyPaid", paymentStatus: "Partially paid", amountINR: 2000, amountPaidINR: null, outstandingINR: null, balance: "not_recorded", flags: ["Paid amount and balance are not recorded"], daysOutstanding: 12, createdAt: "2026-10-09T06:00:00.000Z", createdMonth: "2026-10" }),
    outRow({ invoiceNo: "INV-3", lineCount: 2, daysOutstanding: null, invoiceDate: null, flags: ["Lines have different statuses"] }),
  ];
  const html = renderToStaticMarkup(h(MemoryRouter, null, h(OutstandingTable, { data: outPage(items), canEdit: true, canDelete: true, onAction() {} })));
  for (const col of ["Project", "Invoice No.", "Workflow created", "Invoice date", "Status", "Invoice amount", "Paid", "Outstanding", "Days", "Review", "Actions"]) assert.ok(html.includes(col), col);
  assert.equal((html.match(/data-outstanding=/g) ?? []).length, 3);
  assert.match(html, /10 Sept? 2026, 11:30 am IST/, "the September creation date is kept");
  assert.match(html, /data-balance="not_recorded"/);
  const partial = html.slice(html.indexOf('data-outstanding="INV-2"'), html.indexOf('data-outstanding="INV-3"'));
  assert.match(partial, /data-cell="paid"[^>]*>Not recorded</);
  assert.match(partial, /data-cell="outstanding"[^>]*>Not recorded</, "no balance is invented for a Partially Paid invoice");
  assert.match(partial, /Paid amount and balance are not recorded/);
  const raised = html.slice(html.indexOf('data-outstanding="INV-1"'), html.indexOf('data-outstanding="INV-2"'));
  assert.match(raised, /data-cell="outstanding"[^>]*>₹[\s\u202f]?600\.00</);
  assert.match(raised, /data-cell="days"[^>]*>41</);
  assert.match(raised, /text-\[var\(--nu-warning\)\] font-bold/, "30+ days stands out");
  assert.match(html, /data-cell="days"[^>]*>—</, "no invoice date → no age is shown");
  assert.equal((html.match(/aria-label="View invoice INV-/g) ?? []).length, 2, "single-line invoices get the existing actions; a multi-line one opens its project instead");
  assert.match(html, /href="\/projects\/edit\/p1\?tab=invoices&amp;invoiceLineId=l1"/);
  const cards = renderToStaticMarkup(h(OutstandingTotalsCards, { data: outPage(items) }));
  assert.match(cards, /data-stat="Outstanding invoices"[^]*?>11</);
  assert.match(cards, /data-stat="Known outstanding"[^]*?₹[\s\u202f]?6,050/);
  assert.match(cards, /Balance not recorded · invoice total ₹[\s\u202f]?2,000\.00 \(not an outstanding figure\)/);
  assert.match(cards, /data-stat="30\+ days"[^]*?>9</);
  assert.match(cards, /225 days/);
  const readOnly = renderToStaticMarkup(h(MemoryRouter, null, h(OutstandingTable, { data: outPage(items), canEdit: false, canDelete: false, onAction() {} })));
  assert.equal(/aria-label="(Edit|Delete) invoice/.test(readOnly), false, "Edit / Delete follow the existing approval rights");
});

test("the Outstanding request has its own endpoint and takes no month; All history asks for every month", async () => {
  const { outstandingQueryString, fetchOutstanding, ALL_MONTHS } = await load("/src/services/invoiceTrackerService.ts");
  assert.equal(outstandingQueryString({ page: 1, pageSize: 25 }), "page=1&pageSize=25");
  assert.equal(outstandingQueryString({ page: 2, pageSize: 50, search: "acme", projectStatus: "Active" }), "page=2&pageSize=50&search=acme&projectStatus=Active");
  assert.equal(ALL_MONTHS, "all");
  const { apiClient } = await load("/src/services/apiClient.ts");
  const original = apiClient.get;
  const seen = [];
  apiClient.get = async (path) => (seen.push(path), {});
  try {
    await fetchOutstanding({ page: 1, pageSize: 25, search: "x" });
    const { fetchTrackerMonth, fetchTrackerChain } = await load("/src/services/invoiceTrackerService.ts");
    await fetchTrackerMonth({ month: "all", page: 1, pageSize: 25 });
    await fetchTrackerChain("p1", "all");
  } finally {
    apiClient.get = original;
  }
  assert.deepEqual(seen, ["/invoice-tracker/outstanding?page=1&pageSize=25&search=x", "/invoice-tracker?month=all&page=1&pageSize=25", "/invoice-tracker/projects/p1/invoices?month=all"]);
});

test("summary cards and table use the Repository's bordered card/table styling, with light and dark variants", async () => {
  const { TrackerSummaryCards, TrackerTable } = await load("/src/pages/InvoiceTracker/InvoiceTracker.tsx");
  const cards = renderToStaticMarkup(h(TrackerSummaryCards, { data: page([]) }));
  assert.equal((cards.match(/border border-slate-200 dark:border-slate-800/g) ?? []).length, 7, "every card has a visible border with a dark variant");
  assert.match(cards, /rounded-xl/);
  assert.match(cards, /shadow-sm/);
  assert.equal((cards.match(/data-edge/g) ?? []).length, 7, "each card has the Repository-style coloured left edge");
  assert.match(cards, /#3B82F6/);
  assert.match(cards, /bg-emerald-50 dark:bg-emerald-950\/20/, "accent chips keep a dark variant");
  const table = renderToStaticMarkup(h(MemoryRouter, null, h(TrackerTable, { data: page([row(1)]), month: "2026-03", expanded: new Set(["p1"]), onToggle() {}, renderChain: () => "CHAIN" })));
  assert.match(table, /border-b border-slate-200 dark:border-slate-800/, "header separator");
  assert.match(table, /font-extrabold uppercase/, "header typography matches the Repository");
  assert.match(table, /border-b border-slate-100 dark:border-slate-800\/80/, "row separators");
  assert.match(table, /bg-slate-50 dark:bg-slate-950\/50/, "the expanded area is visually distinct from the project row");
});

test("the page opens with the same gradient hero banner as the other PMO pages, with Refresh and the project total", async () => {
  const text = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  assert.match(text, /linear-gradient\(135deg, #0F172A 0%, #1E3A8A 50%, #0E7490 100%\)/, "the Projects page's hero gradient");
  assert.match(text, /html\.dark \.trk-hero/, "dark-theme variant");
  assert.match(text, /iFluids Engineering · Project Management Office/);
  assert.match(text, /data-hero/);
  assert.match(text, /Projects with records/);
});

// ── Opening View / Edit: request orchestration (deterministic — no millisecond thresholds) ───────────────────────────
function gatedApi(apiClient, { failPath } = {}) {
  const calls = [];
  const waiting = [];
  const original = apiClient.get;
  apiClient.get = (path) =>
    new Promise((resolve, reject) => {
      calls.push(path);
      waiting.push(() => {
        if (failPath && path.endsWith(failPath)) return reject(new Error("boom"));
        resolve(path === "/projects/p9" ? projectDto("p9") : path.endsWith("/invoice-items") ? { items: [] } : path.endsWith("/quantity") || path.endsWith("/milestones") ? { items: [] } : { items: [] });
      });
    });
  return { calls, release: () => waiting.splice(0).forEach((f) => f()), restore: () => (apiClient.get = original) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("opening an invoice: the four independent reads start together, no read is repeated, and resources are not fetched", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectInvoiceContext } = await load("/src/services/invoiceTrackerService.ts");
  const api = gatedApi(apiClient);
  try {
    const pending = loadProjectInvoiceContext("p9");
    await tick();
    assert.deepEqual([...api.calls].sort(), ["/projects/p9", "/projects/p9/invoice-items", "/projects/p9/milestones", "/projects/p9/quantity"], "all four are in flight before any has answered");
    api.release();
    const project = await pending;
    assert.equal(project.id, "p9");
    assert.equal(project.invoiceCurrency, "INR", "the currency comes from the project record already fetched");
    assert.equal(api.calls.length, 4, "GET /projects/:id once, not twice; no /resources request");
    assert.equal(api.calls.filter((p) => p === "/projects/p9").length, 1);
  } finally {
    api.restore();
  }
});

test("opening an invoice twice at once (double click / StrictMode) shares one load; the next open is a fresh load", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectInvoiceContext } = await load("/src/services/invoiceTrackerService.ts");
  const api = gatedApi(apiClient);
  try {
    const first = loadProjectInvoiceContext("p9");
    const second = loadProjectInvoiceContext("p9");
    await tick();
    assert.equal(api.calls.length, 4, "one set of requests for two callers");
    api.release();
    await Promise.all([first, second]);
    const third = loadProjectInvoiceContext("p9");
    await tick();
    assert.equal(api.calls.length, 8, "nothing is cached after it settles — a later open reads the server again");
    api.release();
    await third;
  } finally {
    api.restore();
  }
});

test("a failed read fails the whole load (never a partial project) and does not poison the next attempt", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectInvoiceContext } = await load("/src/services/invoiceTrackerService.ts");
  let api = gatedApi(apiClient, { failPath: "/quantity" });
  try {
    const failing = loadProjectInvoiceContext("p9");
    await tick();
    api.release();
    await assert.rejects(failing, /boom/);
  } finally {
    api.restore();
  }
  api = gatedApi(apiClient);
  try {
    const retry = loadProjectInvoiceContext("p9");
    await tick();
    api.release();
    assert.equal((await retry).id, "p9", "retry starts a new load");
  } finally {
    api.restore();
  }
});

test("the host ignores stale loads: a closed or switched action never applies an old response, and errors are recoverable", () => {
  const host = src("pages/InvoiceTracker/InvoiceActionHost.tsx");
  assert.match(host, /usePagedRequest\(fetcher, `\$\{action\.projectId\}:\$\{action\.lineId\}:\$\{action\.mode\}`\)/, "the request key includes the invoice line, so switching invoices starts a new load");
  const paging = src("pages/Settings/components/weeklyEmails/useWeeklyEmailPaging.ts");
  assert.match(paging, /active = false; \/\/ anything still in flight is now stale/, "a superseded or unmounted request cannot update state");
  assert.match(host, /Couldn't open the invoice/);
  assert.match(host, /onClick=\{load\.retry\}/, "Try again");
  assert.match(src("pages/InvoiceTracker/InvoiceTracker.tsx"), /key=\{`\$\{action\.projectId\}:\$\{action\.lineId\}:\$\{action\.mode\}`\}/, "a different invoice remounts the host — no state carries over");
});

test("two projects loading at once (answers arriving out of order) never share or swap data; shared loads are per project", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectInvoiceContext } = await load("/src/services/invoiceTrackerService.ts");
  const original = apiClient.get;
  const held = { p7: [], p8: [] };
  const calls = [];
  apiClient.get = (path) =>
    new Promise((resolve) => {
      calls.push(path);
      const id = path.split("/")[2];
      held[id].push(() => resolve(path === `/projects/${id}` ? { ...projectDto(id), prNo: `PR-${id}` } : { items: [] }));
    });
  try {
    const first = loadProjectInvoiceContext("p7");
    const second = loadProjectInvoiceContext("p8");
    const again = loadProjectInvoiceContext("p7"); // joins p7's load only
    await tick();
    assert.equal(calls.length, 8, "four reads per project, none for the repeated p7 call");
    held.p8.splice(0).forEach((f) => f()); // the later request answers first
    const p8 = await second;
    held.p7.splice(0).forEach((f) => f());
    const [p7a, p7b] = [await first, await again];
    assert.deepEqual([p8.id, p8.prNo, p7a.id, p7a.prNo], ["p8", "PR-p8", "p7", "PR-p7"], "each caller gets its own project");
    assert.equal(p7a, p7b, "the repeated p7 call shares p7's load — never p8's");
  } finally {
    apiClient.get = original;
  }
});

test("month selector: always displays exactly the selected month (URL = selector = request = cards = rows share ONE value)", async () => {
  const { MonthSelect } = await load("/src/pages/InvoiceTracker/MonthSelect.tsx");
  const render = (value, currentYear = 2026) => renderToStaticMarkup(h(MonthSelect, { value, onChange() {}, currentYear }));
  const selected = (html) => [...html.matchAll(/<option value="(\d+)"[^>]*selected[^>]*>([^<]+)</g)].map((m) => m[2]);
  assert.deepEqual(selected(render("2026-10")), ["October", "2026"], "month=2026-10 displays October 2026");
  assert.deepEqual(selected(render("2026-02")), ["February", "2026"]);
  assert.deepEqual(selected(render("2026-03")), ["March", "2026"]);
  assert.deepEqual(selected(render("2031-12")), ["December", "2031"], "a year outside the usual window is still offered, so the value can never be missing from the list");
  assert.deepEqual(selected(render("2019-01", 2026)), ["January", "2019"]);
  assert.match(render("2026-10"), /data-value="2026-10"/);
  assert.equal((render("2026-10").match(/<option/g) ?? []).length, 12 + 8, "12 months + 2020..2027");
  const { yearOptions } = await load(FMT);
  assert.deepEqual(yearOptions(2026, 2026), [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
  assert.deepEqual(yearOptions(2031, 2026).at(-1), 2031);
  assert.deepEqual(yearOptions(2018, 2026)[0], 2018);
  // choosing a month or a year reports ONE consistent YYYY-MM
  const calls = [];
  const tree = MonthSelect({ value: "2026-10", onChange: (m) => calls.push(m), currentYear: 2026 });
  const selects = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === "select") selects.push(n);
    walk(n.props?.children);
  })(tree);
  assert.equal(selects.length, 2);
  selects[0].props.onChange({ target: { value: "2" } });
  selects[1].props.onChange({ target: { value: "2025" } });
  assert.deepEqual(calls, ["2026-02", "2025-10"]);
});

test("the default month is the CURRENT India month, from the same helper that already drives the portal's date handling", async () => {
  const { currentMonthIST, isValidMonth } = await load(FMT);
  assert.equal(currentMonthIST(new Date("2026-10-21T05:00:00Z")), "2026-10");
  assert.equal(currentMonthIST(new Date("2027-02-14T05:00:00Z")), "2027-02", "February when it is February");
  assert.equal(currentMonthIST(new Date("2026-03-31T18:30:00Z")), "2026-04", "India midnight rolls the month");
  assert.equal(isValidMonth("2026-10"), true);
  const text = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  assert.match(text, /isValidMonth\(filters\.month\) \? filters\.month : currentMonthIST\(\)/);
  // the one value feeds the selector, the request and the cards' scope
  assert.match(text, /fetchTrackerMonth\(\{ month, page, pageSize, search, projectStatus, filter \}\)/);
  assert.match(text, /<MonthSelect value=\{selectedMonth\}/);
  assert.match(text, /<TrackerSummaryCards data=\{data\} \/>/);
  assert.match(text, /data-scope=\{data\.month\}/);
});

test("chain (All history): invoices follow the server's order, requests are listed apart; every saved status reads correctly", async () => {
  const { InvoiceChainView } = await load("/src/pages/InvoiceTracker/InvoiceChain.tsx");
  const render = (data) => renderToStaticMarkup(h(InvoiceChainView, { data, loading: false, canEdit: true, canDelete: true, onAction() {} }));
  const statuses = [
    ["D", "Draft", "Not applicable"],
    ["R", "Raised", "Awaiting payment"],
    ["P", "PartiallyPaid", "Partially paid"],
    ["X", "Paid", "Paid"],
    ["C", "Cancelled", "Not applicable"],
  ];
  const invoices = statuses.map(([k, status, paymentStatus]) => invoice({ key: k, invoiceNo: `INV-${k}`, status, paymentStatus }));
  const reqs = [request({ id: "q1" }), request({ id: "q2", status: "Completed", label: "Completed" })];
  const order = [
    { kind: "invoice", id: "R" }, { kind: "invoice", id: "X" }, { kind: "invoice", id: "P" }, { kind: "request", id: "q1" }, { kind: "invoice", id: "D" }, { kind: "request", id: "q2" }, { kind: "invoice", id: "C" },
  ];
  const html = render(chainData(invoices, reqs, "all", order));
  const seq = [...html.matchAll(/data-(?:invoice|request)="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(seq, ["R", "X", "P", "D", "C", "q1", "q2"], "invoices in the server's order, then the requests in their own section — never interleaved");
  const block = (key) => html.slice(html.indexOf(`data-invoice="${key}"`), html.indexOf("</li>", html.indexOf(`data-invoice="${key}"`)));
  assert.match(block("R"), /Raised \/ Submitted/);
  assert.match(block("D"), />Draft</);
  assert.match(block("P"), />Partially Paid</);
  assert.match(block("X"), />Paid</);
  assert.match(block("C"), />Cancelled</);
  for (const [k, , pay] of statuses) assert.match(block(k), new RegExp(`Payment: ${pay}`), `payment wording for ${k}`);
  assert.match(html, /data-request-status="Open"/);
  assert.match(html, /data-request-status="Completed"/);
  // older payloads without an explicit order still render everything (invoices, then requests)
  const legacy = render({ ...chainData(invoices.slice(0, 2), [reqs[0]], "all"), order: undefined });
  assert.deepEqual([...legacy.matchAll(/data-(?:invoice|request)="([^"]+)"/g)].map((m) => m[1]), ["D", "R", "q1"]);
});

// ───────── Latest raised invoice · drafts and requests · previous invoices ─────────
const inv = (key, over = {}) => invoice({ key, invoiceNo: key, ...over });
const finOf = (status, amount) => ({
  Raised: { amountINR: amount, amountPaidINR: 0, paidBasis: "none_yet", outstandingINR: amount, balance: "full", flags: [] },
  Paid: { amountINR: amount, amountPaidINR: amount, paidBasis: "inferred_from_status", outstandingINR: 0, balance: "settled", flags: [] },
  PartiallyPaid: { amountINR: amount, amountPaidINR: null, paidBasis: "not_recorded", outstandingINR: null, balance: "not_recorded", flags: ["Paid amount and balance are not recorded"] },
  Draft: { amountINR: amount, amountPaidINR: null, paidBasis: "not_applicable", outstandingINR: null, balance: "not_applicable", flags: [] },
  Cancelled: { amountINR: amount, amountPaidINR: null, paidBasis: "not_applicable", outstandingINR: null, balance: "not_applicable", flags: [] },
}[status]);
const made = (key, status, date, amount, over = {}) => inv(key, { status, invoiceDate: date, amountINR: amount, paymentStatus: status === "Paid" ? "Paid" : status === "Raised" ? "Awaiting payment" : "Not applicable", financials: finOf(status, amount), lines: [{ id: `l-${key}`, quantityItemId: "q1", activity: "Act", status, amountINR: amount }], ...over });
const renderChain = (data, canEdit = true, canDelete = true) => load("/src/pages/InvoiceTracker/InvoiceChain.tsx").then(({ InvoiceChainView }) => renderToStaticMarkup(h(InvoiceChainView, { data, loading: false, canEdit, canDelete, onAction() {} })));
const sectionOf = (html, name) => {
  const at = html.indexOf(`data-section="${name}"`);
  if (at < 0) return "";
  const open = html.lastIndexOf("<", at);
  const tag = html.slice(open + 1, html.indexOf(" ", open)).trim();
  return html.slice(open, html.indexOf(`</${tag}>`, at) + tag.length + 3);
};
const flat = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("expanded project: the LATEST RAISED invoice is the headline (amount first), then drafts and requests, then collapsed previous invoices — and no invoice is in two sections", async () => {
  // March: INV-9 Paid (12 Mar) is the latest raised invoice even though a NEWER Draft (20 Mar) exists; INV-5 (4 Mar) and INV-1 (Feb) are older.
  const latest = made("INV-9", "Paid", "2026-03-12", 450000);
  const draft = made("INV-D", "Draft", "2026-03-20", 80000);
  const older = made("INV-5", "Raised", "2026-03-04", 120000);
  const feb = made("INV-1", "Raised", "2026-02-10", 60000);
  const cancelled = made("INV-X", "Cancelled", "2026-03-02", 10000);
  const data = chainData([latest, draft, older, cancelled], [request()], "2026-03", undefined, [feb], 0, {
    latestRaisedKey: "INV-9", latestRaisedInMonth: true, draftKeys: ["INV-D"], historyKeys: ["INV-5", "INV-X", "INV-1"],
    olderOutstanding: { count: 2, amountINR: 180000, knownAmountINR: 180000, unknownCount: 0, undatedCount: 0, keys: ["INV-5", "INV-1"] },
  });
  const html = await renderChain(data);
  const head = sectionOf(html, "latest");
  const dr = sectionOf(html, "drafts-requests");
  const prev = sectionOf(html, "previous");
  assert.match(head, /Latest raised invoice · March 2026/);
  assert.match(head, /data-latest-amount[^>]*>₹[\s ]?4,50,000\.00</, "the amount is the largest text of the headline");
  assert.ok(head.includes("INV-9") && head.includes(">Paid<") && /Invoice date 12 Mar 2026/.test(flat(head)));
  assert.match(head, /Inferred from Paid status/, "Amount paid is labelled as inferred");
  assert.equal(head.includes("INV-D"), false, "a newer Draft never replaces the latest raised invoice");
  assert.ok(dr.includes('data-invoice="INV-D"') && dr.includes('data-request="r1"'), "the draft and the request sit together, apart from the headline");
  assert.equal(dr.includes("INV-9") || dr.includes("INV-5"), false);
  assert.match(flat(dr), /Not raised invoices/, "…and are labelled as not raised");
  assert.deepEqual([...prev.matchAll(/data-invoice="([^"]+)"/g)].map((m) => m[1]), ["INV-5", "INV-X", "INV-1"], "history: every other invoice up to the month's end, as the server ordered it (cancelled included)");
  const keys = [...html.matchAll(/data-invoice="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(keys).size, keys.length, "each invoice appears exactly once on the page");
  assert.deepEqual(keys, ["INV-9", "INV-D", "INV-5", "INV-X", "INV-1"]);
  assert.ok(html.indexOf('data-section="latest"') < html.indexOf('data-section="drafts-requests"') && html.indexOf('data-section="drafts-requests"') < html.indexOf('data-section="previous"'));
  assert.equal(/data-no-invoice-this-month/.test(html), false);
});

test("previous invoices: collapsed by default with a count and an Expand history control; rows carry their own date, status, amount and settlement", async () => {
  const latest = made("INV-9", "Paid", "2026-03-12", 450000);
  const paid = made("INV-3", "Paid", "2026-01-30", 333000);
  const raised = made("INV-5", "Raised", "2026-02-02", 5000, { raisedAt: "2026-02-03T05:30:00.000Z" });
  const part = made("INV-6", "PartiallyPaid", "2025-12-01", 125000);
  const data = chainData([latest], [], "2026-03", undefined, [raised, paid, part], 0, { latestRaisedKey: "INV-9", latestRaisedInMonth: true, draftKeys: [], historyKeys: ["INV-5", "INV-3", "INV-6"] });
  const html = await renderChain(data);
  const prev = sectionOf(html, "previous");
  assert.match(prev, /^<details[^>]*data-previous/, "a native, keyboard-accessible collapsible");
  assert.equal(/<details[^>]*\sopen[\s=>]/.test(prev.slice(0, 220)), false, "collapsed by default");
  assert.match(flat(prev), /Previous invoices \(3\)/, "the number of historical invoices");
  assert.match(prev, /Expand history/);
  assert.match(prev, /Collapse history/, "…and the way back (shown while open)");
  assert.match(prev, /Earlier invoices for this project, shown for billing context/);
  const row = (key) => flat(prev.slice(prev.indexOf(`data-invoice="${key}"`), prev.indexOf("</tr>", prev.indexOf(`data-invoice="${key}"`))));
  assert.match(row("INV-3"), /Paid 30 Jan 2026 .*3,33,000\.00 .*3,33,000\.00 Inferred from Paid status .*0\.00 Settled \(Paid\)/);
  assert.match(row("INV-5"), /Raised \/ Submitted 02 Feb 2026 .*5,000\.00 .*0\.00 Awaiting payment .*5,000\.00 Owed in full/);
  assert.match(row("INV-6"), /Partially Paid 01 Dec 2025 .*Not recorded No amount stored .*Not recorded Balance not stored/, "no number is invented for a Partially Paid invoice");
  assert.match(row("INV-6"), /Review: Paid amount and balance are not recorded/);
  assert.equal(/data-raised-this-month/.test(prev), false);
});

test("a month with no raised invoice says so; the latest AVAILABLE raised invoice is shown separately, with its real date", async () => {
  const old = made("INV-5", "Raised", "2026-01-15", 120000);
  const draft = made("INV-D", "Draft", "2026-03-05", 9000);
  const data = chainData([draft], [request()], "2026-03", undefined, [old], 0, { latestRaisedKey: "INV-5", latestRaisedInMonth: false, draftKeys: ["INV-D"], historyKeys: [] });
  const html = await renderChain(data);
  assert.match(html, /data-no-invoice-this-month[^>]*>No invoice raised this month/);
  const head = sectionOf(html, "latest");
  assert.match(head, /Latest available raised invoice/);
  assert.equal(/Latest raised invoice · /.test(head), false, "it is not presented as this month's invoice");
  assert.match(flat(head), /INV-5/);
  assert.match(flat(head), /Invoice date 15 Jan 2026/);
  assert.match(sectionOf(html, "drafts-requests"), /data-invoice="INV-D"/, "the Draft is a draft, not the headline");
  // a project that has never raised anything: only the statement
  const none = await renderChain(chainData([draft], [], "2026-03", undefined, [], 0, { draftKeys: ["INV-D"] }));
  assert.match(none, /No invoice raised this month/);
  assert.equal(/data-record="latest-raised"/.test(none), false);
  assert.match(none, /No previous invoices for this project\./);
});

test("request-only project: 'No invoice raised this month', the request in its own table, and a completed request is neither raised nor paid", async () => {
  const html = await renderChain(chainData([], [request(), request({ id: "r2", ref: "R2ZZ99YY", status: "Completed", label: "Completed", fulfilledByInvoiceNo: "INV-9", amountNote: "about 7 lakh" })], "2026-03"));
  assert.match(html, /No invoice raised this month/);
  const dr = sectionOf(html, "drafts-requests");
  assert.match(dr, /data-request="r1"/);
  assert.match(dr, /data-request-status="Completed"/);
  assert.match(dr, />R1AB23CD</);
  assert.match(dr, /data-request-amount[^>]*>Not recorded</, "a request has no numeric amount");
  assert.match(dr, /about 7 lakh \(free text\)/);
  assert.match(flat(dr), /Fulfilled by invoice INV-9 — a completed request is not a payment/);
  assert.match(flat(dr), /Waiting for Accounts to raise the invoice/);
  assert.equal(/data-record="latest-raised"|data-record="previous-invoice"|data-invoice=/.test(html), false, "no invoice at all is shown for a request");
  const empty = await renderChain(chainData([], [], "2026-03"));
  assert.match(empty, /No drafts or invoice requests for March 2026\./);
});

test("older outstanding warning: count and total when reliable; total withheld when a balance is unknown; undated outstanding invoices are flagged, never counted; traceable to history rows", async () => {
  const latest = made("INV-9", "Paid", "2026-03-12", 450000);
  const o1 = made("INV-5", "Raised", "2026-02-02", 120000);
  const o2 = made("INV-4", "PartiallyPaid", "2026-01-02", 90000);
  const paidOld = made("INV-1", "Paid", "2025-12-02", 50000);
  const base = { latestRaisedKey: "INV-9", latestRaisedInMonth: true, draftKeys: [], historyKeys: ["INV-5", "INV-4", "INV-1"] };
  const run = (older) => renderChain(chainData([latest], [], "2026-03", undefined, [o1, o2, paidOld], 0, { ...base, olderOutstanding: { keys: [], ...older } }));
  const reliable = await run({ count: 1, amountINR: 120000, knownAmountINR: 120000, unknownCount: 0, undatedCount: 0, keys: ["INV-5"] });
  assert.match(flat(reliable), /1 older invoice outstanding — ₹[\s ]?1,20,000\.00/);
  assert.match(reliable, /role="status" data-older-outstanding/);
  assert.match(reliable, /Review in Previous invoices/, "a way to inspect the records behind the figure");
  const row = (html, key) => html.slice(html.indexOf(`data-invoice="${key}"`), html.indexOf("</tr>", html.indexOf(`data-invoice="${key}"`)));
  assert.match(row(reliable, "INV-5"), /data-tag="older-outstanding"/, "the counted invoice is tagged in the history");
  assert.equal(/data-tag="older-outstanding"/.test(row(reliable, "INV-1")), false, "a Paid older invoice is not outstanding");
  assert.equal(/data-tag="older-outstanding"/.test(row(reliable, "INV-4")), false, "only the counted keys are tagged");
  const unknown = await run({ count: 2, amountINR: null, knownAmountINR: 120000, unknownCount: 1, undatedCount: 0, keys: ["INV-5", "INV-4"] });
  assert.match(flat(unknown), /2 older invoices outstanding — total not recorded \(1 without a recorded balance, needs review\)/);
  assert.equal(/2 older invoices outstanding — ₹/.test(flat(unknown)), false, "no partial or guessed total");
  const undated = await run({ count: 0, amountINR: 0, knownAmountINR: 0, unknownCount: 0, undatedCount: 2, keys: [] });
  assert.match(flat(undated), /2 outstanding invoices with no usable invoice date — cannot be placed before or after the latest invoice; see the Outstanding tab/);
  assert.equal(/Review in Previous invoices/.test(undated), false, "nothing in the history to review for undated ones");
  const none = await run({ count: 0, amountINR: 0, knownAmountINR: 0, unknownCount: 0, undatedCount: 0, keys: [] });
  assert.equal(/data-older-outstanding/.test(none), false, "no warning when nothing older is outstanding");
});

test("previous invoices: dated-this-month tag, View / Edit / Delete under the same permissions, callbacks name that invoice, multi-line invoices keep per-line actions", async () => {
  const latest = made("INV-9", "Raised", "2026-03-12", 1000);
  const sameMonth = made("INV-8", "Paid", "2026-03-02", 500);
  const feb = made("INV-1", "Raised", "2026-02-10", 60000);
  const data = chainData([latest, sameMonth], [], "2026-03", undefined, [feb], 0, { latestRaisedKey: "INV-9", latestRaisedInMonth: true, draftKeys: [], historyKeys: ["INV-8", "INV-1"] });
  const html = await renderChain(data, false, false);
  const prev = sectionOf(html, "previous");
  const r8 = prev.slice(prev.indexOf('data-invoice="INV-8"'), prev.indexOf("</tr>", prev.indexOf('data-invoice="INV-8"')));
  assert.match(r8, /data-tag="this-month"/, "an older raised invoice of the SAME month is in the history, tagged");
  assert.equal(/data-tag="this-month"/.test(prev.slice(prev.indexOf('data-invoice="INV-1"'))), false);
  assert.ok(prev.includes('aria-label="View invoice INV-1"') && !prev.includes("Edit invoice INV-1") && !prev.includes("Delete invoice INV-1"));
  const full = await renderChain(data, true, true);
  assert.ok(sectionOf(full, "previous").includes("Edit invoice INV-1") && sectionOf(full, "previous").includes("Delete invoice INV-1"));
  assert.equal(/Delete invoice INV-1/.test(sectionOf(await renderChain(data, true, false), "previous")), false);
  assert.equal(/Edit invoice INV-1/.test(sectionOf(await renderChain(data, false, true), "previous")), false);
  // a click calls back with that invoice's line
  const { InvoiceChainView } = await load("/src/pages/InvoiceTracker/InvoiceChain.tsx");
  const calls = [];
  const tree = InvoiceChainView({ data, loading: false, canEdit: true, canDelete: true, onAction: (a) => calls.push(a) });
  const buttons = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n.type === "function") {
      try { return walk(n.type(n.props)); } catch { /* hooks-only components */ }
    }
    if (n.type === "button") buttons.push(n);
    walk(n.props?.children);
  })(tree);
  const mine = buttons.filter((b) => /invoice INV-1$/.test(b.props["aria-label"] ?? ""));
  assert.equal(mine.length, 3);
  mine.forEach((b) => b.props.onClick());
  assert.deepEqual(calls.map((c) => [c.mode, c.invoiceNo, c.lineId, c.projectId]), [["view", "INV-1", "l-INV-1", "p1"], ["edit", "INV-1", "l-INV-1", "p1"], ["delete", "INV-1", "l-INV-1", "p1"]]);
  const multi = made("INV-M", "Raised", "2026-02-11", 3, { lines: [{ id: "a", quantityItemId: "q1", activity: "Eng", status: "Raised", amountINR: 1 }, { id: "b", quantityItemId: "q2", activity: "Draw", status: "Raised", amountINR: 2 }] });
  const mh = await renderChain(chainData([latest], [], "2026-03", undefined, [multi], 0, { latestRaisedKey: "INV-9", latestRaisedInMonth: true, historyKeys: ["INV-M"] }));
  assert.match(mh, /2 lines/);
  assert.equal((mh.match(/aria-label="View invoice INV-M"/g) ?? []).length, 2);
});

test("an invoice with no usable date is in no section — only counted and flagged; empty states are honest; All history keeps its own layout", async () => {
  const latest = made("INV-9", "Raised", "2026-03-12", 1000);
  const withUndated = await renderChain(chainData([latest], [], "2026-03", undefined, [], 2, { latestRaisedKey: "INV-9", latestRaisedInMonth: true, historyKeys: [] }));
  assert.match(withUndated, /2 invoices of this project have no usable invoice date, so they are not placed in any month — see All history\./);
  assert.match(withUndated, /No previous invoices for this project\./);
  assert.equal((withUndated.match(/data-invoice=/g) ?? []).length, 1, "the undated ones are never rendered with an invented month");
  const all = await renderChain(chainData([made("A", "Raised", "2026-01-01", 5, { createdMonth: "2026-01" })], [request()], "all"));
  assert.equal(/data-section="(latest|previous|drafts-requests)"/.test(all), false, "All history is the full list, unchanged");
  assert.match(all, /data-month-badge/);
  assert.ok(all.includes('data-section="current"') && all.includes('data-section="requests"'));
});

test("history stays collapsed per invoice and the tables scroll sideways on narrow screens instead of breaking the page", async () => {
  const latest = made("INV-9", "Raised", "2026-03-12", 1000);
  const feb = made("INV-1", "Raised", "2026-02-10", 60000);
  const html = await renderChain(chainData([latest], [request()], "2026-03", undefined, [feb], 0, { latestRaisedKey: "INV-9", latestRaisedInMonth: true, historyKeys: ["INV-1"] }));
  const toggles = [...html.matchAll(/<details[^>]*data-history-toggle[^>]*>/g)].map((m) => m[0]);
  assert.equal(toggles.length, 1, "the headline invoice's history (previous rows carry none)");
  assert.ok(toggles.every((d) => !/\sopen[\s=>]/.test(d)));
  assert.match(html, /Status history \(1 event\)/);
  assert.ok((html.match(/overflow-x-auto/g) ?? []).length >= 2, "the drafts/requests and previous tables scroll sideways");
  assert.match(sectionOf(html, "previous"), /hidden sm:table-cell/, "a less important column drops out on narrow screens");
});

test("project row headline: the latest raised invoice (amount first) or 'No invoice raised this month' — never a chip per historical status — plus a compact older-outstanding warning", async () => {
  const { TrackerTable } = await load("/src/pages/InvoiceTracker/InvoiceTracker.tsx");
  const none = { count: 0, amountINR: 0, knownAmountINR: 0, unknownCount: 0, undatedCount: 0 };
  const l = (over = {}) => ({ invoiceNo: "INV-9", invoiceDate: "2026-03-12", amountINR: 450000, status: "Paid", paymentStatus: "Paid", inMonth: true, ...over });
  const items = [
    row(1, { latestRaised: l(), olderOutstanding: { count: 1, amountINR: 120000, knownAmountINR: 120000, unknownCount: 0, undatedCount: 0 }, records: records({ recordCount: 7, invoiceCount: 6, byStatus: { raised: 2, partiallyPaid: 1, paid: 1, draft: 1, cancelled: 1 }, draftInvoiceCount: 1, completedRequestCount: 1 }) }),
    row(2, { hasOpenInvoiceRequest: true, records: records({ recordCount: 1, openRequestCount: 1 }) }),
    row(3, { records: records({ recordCount: 1, invoiceCount: 1, byStatus: { ...zero, draft: 1 }, draftInvoiceCount: 1 }) }),
    row(4, { latestRaised: l({ invoiceNo: "INV-4", amountINR: 500, status: "Paid", invoiceDate: "2026-02-05", inMonth: false }), olderOutstanding: { count: 2, amountINR: null, knownAmountINR: 100, unknownCount: 1, undatedCount: 1 }, records: records({ recordCount: 1, invoiceCount: 1, byStatus: { ...zero, draft: 1 } }) }),
  ];
  const html = renderToStaticMarkup(h(MemoryRouter, null, h(TrackerTable, { data: page(items), month: "2026-03", expanded: new Set(), onToggle() {}, renderChain: () => "CHAIN" })));
  for (const col of ["S. No.", "PR No.", "Client Name", "Project Title", "WO Value", "Latest raised invoice (this month)", "Records", "Actions"]) assert.ok(html.includes(col), col);
  assert.equal(/data-status-chip/.test(html), false, "the row no longer shows a chip for every status");
  const cell = (pr) => html.slice(html.indexOf(`data-project="${pr}"`), html.indexOf("</tr>", html.indexOf(`data-project="${pr}"`)));
  assert.match(cell("PR-1"), /data-latest-amount[^>]*>₹[\s ]?4,50,000\.00</);
  assert.match(flat(cell("PR-1")), /INV-9 Paid Invoice date 12 Mar 2026/);
  assert.match(flat(cell("PR-1")), /1 older invoice outstanding — ₹[\s ]?1,20,000\.00/);
  assert.match(flat(cell("PR-1")), /6 invoices · 1 draft · 1 request/);
  assert.match(flat(cell("PR-2")), /No invoice raised this month/);
  assert.match(flat(cell("PR-2")), /0 invoices · 1 request/);
  assert.equal(/data-older-outstanding/.test(cell("PR-2")), false);
  assert.match(flat(cell("PR-3")), /No invoice raised this month/);
  assert.match(flat(cell("PR-3")), /1 invoice · 1 draft · 0 requests/, "a Draft is counted as a draft, never shown as the headline");
  assert.equal(/data-latest-invoice=/.test(cell("PR-3")), false);
  const r4 = flat(cell("PR-4"));
  assert.match(r4, /No invoice raised this month/);
  assert.match(r4, /Latest available: INV-4 · ₹[\s ]?500\.00 · Paid · 05 Feb 2026/, "an older invoice is only ever the latest AVAILABLE one, with its real date");
  assert.equal(/data-latest-amount/.test(cell("PR-4")), false, "…and never the prominent amount");
  assert.match(r4, /2 older invoices outstanding — total not recorded/);
  assert.match(r4, /1 outstanding invoice with no usable date/);
  assert.equal((html.match(/New invoice request has been sent for approval\./g) ?? []).length, 1, "the + indicator only where a request is open");
  assert.match(html, /href="\/projects\/edit\/p1\?tab=invoices"/);
  assert.match(html, /aria-label="Show records for PR-1"/);
  // All history: the same headline, labelled without a month
  const all = renderToStaticMarkup(h(MemoryRouter, null, h(TrackerTable, { data: page([row(5, { latestRaised: l({ inMonth: null }) }), row(6)], { month: "all" }), month: "all", expanded: new Set(), onToggle() {}, renderChain: () => "CHAIN" })));
  assert.ok(all.includes("Latest raised invoice") && !all.includes("(this month)"));
  assert.match(flat(all), /No raised invoice/);
});

test("the older-outstanding wording: count only when reliable, total only when every balance is reliable", async () => {
  const { olderOutstandingLines } = await load("/src/pages/InvoiceTracker/trackerFormat.ts");
  const f = (n) => `R${n}`;
  const none = { count: 0, amountINR: 0, unknownCount: 0, undatedCount: 0 };
  assert.deepEqual(olderOutstandingLines(none, f), []);
  assert.deepEqual(olderOutstandingLines({ ...none, count: 1, amountINR: 120000 }, f), ["1 older invoice outstanding — R120000"]);
  assert.deepEqual(olderOutstandingLines({ ...none, count: 3, amountINR: null, unknownCount: 2 }, f, true), ["3 older invoices outstanding — total not recorded"]);
  assert.deepEqual(olderOutstandingLines({ ...none, undatedCount: 1 }, f, true), ["1 outstanding invoice with no usable date"]);
});

test("the monthly report is described — and requested — by INVOICE DATE; nothing on the page still says records are placed by creation date", async () => {
  const text = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  assert.match(text, /Month \(invoice date\)/);
  assert.match(text, /Invoices dated in \$\{formatMonthLabel\(month\)\}/);
  assert.match(text, /No invoice is dated in \$\{formatMonthLabel\(month\)\}/);
  assert.match(text, /latest raised invoice, amount first/i, "the headline rule is stated");
  assert.match(text, /projects with an invoice raised that month come first/i, "the ordering rule is stated");
  assert.doesNotMatch(text, /Month \(records created\)|Records created in|records created in the selected month/, "the old creation-date wording is gone");
  assert.match(src("pages/InvoiceTracker/MonthSelect.tsx"), /aria-label="Invoice date month"/);
  const chain = src("pages/InvoiceTracker/InvoiceChain.tsx");
  assert.match(chain, /No invoice is dated in/);
  assert.match(chain, /invoice requests under the month they were created/, "requests (no invoice date) keep their own rule, stated");
  // the month the page asks the server for is the single selected month — the server decides membership
  assert.match(text, /fetchTrackerMonth\(\{ month, page, pageSize, search, projectStatus, filter \}\)/);
  assert.doesNotMatch(text, /\.sort\(|\.filter\(|createdAt|raisedAt|new Date\(/, "no date filtering, ordering or selection in the browser: the backend is authoritative");
});

test("an expanded invoice shows its three dates separately, and says plainly when the invoice date is missing or invalid (never a substitute date)", async () => {
  const { InvoiceChainView } = await load("/src/pages/InvoiceTracker/InvoiceChain.tsx");
  const render = (invoices) => renderToStaticMarkup(h(InvoiceChainView, { data: chainData(invoices, [], "all"), loading: false, canEdit: true, canDelete: true, onAction() {} }));
  const ok = render([invoice({ invoiceDate: "2026-10-15", createdAt: "2026-10-14T06:00:00.000Z", raisedAt: "2026-10-16T06:00:00.000Z" })]);
  const cell = (html, id) => html.slice(html.indexOf(`data-money="${id}"`), html.indexOf("</div>", html.indexOf(`data-money="${id}"`)));
  assert.match(cell(ok, "invoice-date"), /15 Oct 2026/);
  assert.match(cell(ok, "created"), /14 Oct 2026, 11:30 am IST/);
  assert.match(cell(ok, "raised"), /16 Oct 2026, 11:30 am IST/);
  const missing = render([invoice({ invoiceDate: null, createdAt: "2026-10-14T06:00:00.000Z", financials: { amountINR: 100, amountPaidINR: 0, paidBasis: "none_yet", outstandingINR: 100, balance: "full", flags: ["Invoice date is missing or invalid — not in any month's report"] } })]);
  assert.match(cell(missing, "invoice-date"), /Missing or invalid/);
  assert.equal(/14 Oct 2026/.test(cell(missing, "invoice-date")), false, "the creation date is not shown in its place");
  assert.match(cell(missing, "created"), /14 Oct 2026/, "…it stays in its own field");
  assert.match(missing, /Review: Invoice date is missing or invalid/);
});

test("Amount Paid, Outstanding and Invoice Amount read consistently for every status, and the basis of each settlement figure is stated", async () => {
  const { InvoiceChainView } = await load("/src/pages/InvoiceTracker/InvoiceChain.tsx");
  const render = (fin, status, paymentStatus) => renderToStaticMarkup(h(InvoiceChainView, { data: chainData([invoice({ status, paymentStatus, amountINR: 333000, financials: { amountINR: 333000, flags: [], ...fin } })], [], "all"), loading: false, canEdit: false, canDelete: false, onAction() {} }));
  const money = (html, id) => html.slice(html.indexOf(`data-money="${id}"`), html.indexOf("</div>", html.indexOf(`data-money="${id}"`))).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // the TRK-C-OCT case: Paid, nothing outstanding
  const paid = render({ amountPaidINR: 333000, paidBasis: "inferred_from_status", outstandingINR: 0, balance: "settled" }, "Paid", "Paid");
  assert.match(money(paid, "amount"), /3,33,000\.00/);
  assert.match(money(paid, "paid"), /3,33,000\.00 Inferred from Paid status/);
  assert.match(money(paid, "outstanding"), /0\.00 Settled \(Paid\)/);
  // Raised: nothing paid yet, owed in full
  const raised = render({ amountPaidINR: 0, paidBasis: "none_yet", outstandingINR: 333000, balance: "full" }, "Raised", "Awaiting payment");
  assert.match(money(raised, "paid"), /0\.00 Awaiting payment/);
  assert.match(money(raised, "outstanding"), /3,33,000\.00 Owed in full/);
  // Partially Paid: nothing stored -> nothing shown as a figure
  const partial = render({ amountPaidINR: null, paidBasis: "not_recorded", outstandingINR: null, balance: "not_recorded", flags: ["Paid amount and balance are not recorded"] }, "PartiallyPaid", "Partially paid");
  assert.match(money(partial, "paid"), /Not recorded No amount stored/);
  assert.match(money(partial, "outstanding"), /Not recorded Balance not stored/);
  assert.equal(/₹/.test(money(partial, "paid")) || /₹/.test(money(partial, "outstanding")), false, "no number is invented for a Partially Paid invoice");
  // Paid, but the data contradicts 'settled': not inferred, flagged
  const contradicted = render({ amountPaidINR: null, paidBasis: "not_recorded", outstandingINR: null, balance: "not_recorded", flags: ["Marked Paid, but settlement cannot be confirmed (the invoice amount is zero or invalid) — review"] }, "Paid", "Paid");
  assert.match(money(contradicted, "paid"), /Not recorded No amount stored/);
  assert.match(contradicted, /Review: Marked Paid, but settlement cannot be confirmed/);
  // Draft / Cancelled: not applicable
  const draft = render({ amountPaidINR: null, paidBasis: "not_applicable", outstandingINR: null, balance: "not_applicable" }, "Draft", "Not applicable");
  assert.equal(/data-note/.test(draft.slice(draft.indexOf('data-money="paid"'), draft.indexOf('data-money="outstanding"'))), false);
});

test("saving guard: a project with a save in flight blocks a second action on it until every save settles", async () => {
  const { beginSaving, endSaving, isSaving } = await load("/src/pages/InvoiceTracker/trackerFormat.ts");
  let m = new Map();
  assert.equal(isSaving(m, "p1"), false);
  m = beginSaving(m, "p1");
  assert.equal(isSaving(m, "p1"), true);
  assert.equal(isSaving(m, "p2"), false, "another project is unaffected");
  m = beginSaving(m, "p1");
  m = endSaving(m, "p1");
  assert.equal(isSaving(m, "p1"), true, "two saves: still saving after the first settles");
  m = endSaving(m, "p1");
  assert.equal(isSaving(m, "p1"), false);
  assert.equal(endSaving(m, "p1").size, 0, "settling something that was never begun never goes negative");
  const before = new Map([["p1", 1]]);
  beginSaving(before, "p1");
  assert.equal(before.get("p1"), 1, "pure: the previous map is not mutated");
});

test("the page wires the saving guard and reloads only what a saved invoice changed; the PR link is a single plain navigation", () => {
  const page = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  assert.match(page, /isSaving\(saving, a\.projectId\)/, "a second action on a saving project is refused");
  assert.match(page, /onSaving=\{\(\) => beginProjectSave\(action\.projectId\)\}/);
  assert.match(page, /onSettled=\{\(\) => settleProject\(action\.projectId\)\}/, "a settled save is reported for ITS project");
  assert.match(page, /\[projectId\]: \(t\[projectId\] \?\? 0\) \+ 1/, "…and bumps only that project's tick");
  assert.match(page, /refreshTick=\{refreshTick \+ \(projectTicks\[projectId\] \?\? 0\)\}/, "an open project reloads on Refresh or on its own change — not on another project's");
  assert.doesNotMatch(page, /onSettled=\{refresh\}/, "a save no longer reloads every open project");
  assert.match(page, /role="status"[^>]*data-saving/, "visible, announced feedback while saving");
  // the PR number is one <Link> (client-side navigation to Edit Project → Invoices): no extra onClick that could navigate twice
  const link = page.slice(page.indexOf("to={`/projects/edit/${p.id}?tab=invoices`} className=\"text-[var(--nu-accent)]"), page.indexOf("</Link>", page.indexOf("text-[var(--nu-accent)] hover:underline")));
  assert.ok(link.length > 0 && !/onClick|navigate\(|window\.location/.test(link), "no second navigation handler on the PR link");
  const host = src("pages/InvoiceTracker/InvoiceActionHost.tsx");
  assert.match(host, /onSaving/, "the host reports the save start");
});

test("responsive: the summary cards follow the width the content column actually has (container queries), so no card is ever narrower than ~200px whatever the sidebar", () => {
  const page = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  const grid = /const SUMMARY_GRID = "([^"]+)"/.exec(page)?.[1];
  assert.ok(grid, "the grid classes are one named constant");
  assert.doesNotMatch(grid, /(^|\s)(sm|md|lg|xl|2xl):grid-cols/, "no window (viewport) breakpoint: a 1536px window with a 288px sidebar has only ~1190px for the cards");
  assert.match(page, /className=\{SUMMARY_GRID\} data-summary/);
  assert.match(page, /className="@container space-y-3\.5 nu-fade-in" data-page="invoice-tracker"/, "the page root is the container the grid measures");
  // every tier gives each card at least ~200px (card width = (container - gaps) / columns, gap-3 = 12px)
  const tiers = [...grid.matchAll(/@min-\[(\d+)px\]:grid-cols-(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(tiers.map((t) => t[1]), [2, 4, 7], "2 → 4 → 7 columns as the content widens");
  for (const [width, cols] of tiers) assert.ok((width - (cols - 1) * 12) / cols >= 200, `${cols} columns from ${width}px content width leave each card ≥ 200px`);
  assert.ok(tiers.every((t, i) => i === 0 || t[0] > tiers[i - 1][0]), "thresholds increase with the column count");
});

test("responsive: the sidebar's width is switched by its breakpoint but never ANIMATED — a window resize must not run a 300ms page-wide re-flow with a squeezed sidebar", () => {
  const sidebar = src("components/Sidebar/Sidebar.tsx");
  const aside = sidebar.slice(sidebar.indexOf("<aside"), sidebar.indexOf(">", sidebar.indexOf("<aside") + 6));
  assert.match(aside, /w-\[72px\]/);
  assert.match(aside, /min-\[1440px\]:w-\[18rem\]/);
  assert.doesNotMatch(aside, /transition-all/, "transition-all animated the width over 300ms after crossing 1440px");
  assert.match(aside, /transition-colors/, "the theme colours still transition");
});
