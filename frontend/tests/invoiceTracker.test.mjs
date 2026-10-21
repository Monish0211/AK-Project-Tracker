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
  key: "INV-1", invoiceNo: "INV-1", invoiceDate: "2026-03-01", amountINR: 125000, currency: "INR", originalAmount: null, status: "Raised", mixedLineStatuses: false,
  paymentStatus: "Awaiting payment", lines: [{ id: "l1", quantityItemId: "q1", activity: "Engineering", status: "Raised", amountINR: 125000 }],
  recordedInPortal: { at: "2026-01-11T00:00:00.000Z", by: "Direct Entry" }, hasRecordedHistory: true, timeline: [event()], invoiceRequest: null, ...over,
});
const chainData = (invoices) => ({ month: "2026-03", project: { id: "p1", prNo: "PR-1", client: "C", projectTitle: "T", projectStatus: "Active" }, invoices });

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

test("chain: one block per invoice (never repeating the project), payment kept separate from status, actions follow permissions", async () => {
  const { InvoiceChainView } = await load("/src/pages/InvoiceTracker/InvoiceChain.tsx");
  const five = [1, 2, 3, 4, 5].map((n) => invoice({ key: `INV-${n}`, invoiceNo: `INV-${n}`, lines: [{ id: `l${n}`, quantityItemId: "q1", activity: "A", status: "Raised", amountINR: 100 }] }));
  const render = (canEdit, canDelete, invoices = five) => renderToStaticMarkup(h(InvoiceChainView, { data: chainData(invoices), loading: false, canEdit, canDelete, onAction() {} }));
  const full = render(true, true);
  assert.equal((full.match(/data-invoice=/g) ?? []).length, 5, "five invoices → five blocks");
  assert.equal((full.match(/PR-1/g) ?? []).length, 0, "the project row is not repeated inside its chain");
  assert.equal((full.match(/aria-label="View invoice INV-\d"/g) ?? []).length, 5);
  assert.equal((full.match(/aria-label="Edit invoice INV-\d"/g) ?? []).length, 5);
  assert.equal((full.match(/aria-label="Delete invoice INV-\d"/g) ?? []).length, 5);
  assert.match(full, /Payment: Awaiting payment/);
  assert.match(full, /Raised \/ Submitted/);
  const viewOnly = render(false, false);
  assert.equal(/aria-label="(Edit|Delete) invoice/.test(viewOnly), false, "no Edit / Delete without the rights");
  assert.equal((viewOnly.match(/aria-label="View invoice/g) ?? []).length, 5, "View is always available");
  const editOnly = render(true, false);
  assert.ok(/aria-label="Edit invoice/.test(editOnly) && !/aria-label="Delete invoice/.test(editOnly), "Edit without Delete");
  const multi = renderToStaticMarkup(h(InvoiceChainView, { data: chainData([invoice({ mixedLineStatuses: true, status: "Raised", lines: [{ id: "a", quantityItemId: "q1", activity: "Engineering", status: "Raised", amountINR: 100 }, { id: "b", quantityItemId: "q2", activity: "Drawings", status: "Draft", amountINR: 200 }] })]), loading: false, canEdit: true, canDelete: true, onAction() {} }));
  assert.ok(multi.includes("Engineering") && multi.includes("Drawings"), "a multi-line invoice lists its lines");
  assert.equal((multi.match(/aria-label="Edit invoice INV-1"/g) ?? []).length, 2, "each line has its own actions, as in Invoice History");
  assert.match(multi, /Lines have different statuses/);
  const usd = renderToStaticMarkup(h(InvoiceChainView, { data: chainData([invoice({ currency: "USD", originalAmount: 1500 })]), loading: false, canEdit: false, canDelete: false, onAction() {} }));
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

const row = (n, over = {}) => ({
  id: `p${n}`, prNo: `PR-${n}`, client: `Client ${n}`, projectTitle: `Title ${n}`, projectStatus: "Active", workOrderValueINR: 2_000_000, pendingDueINR: 500_000, hasOpenInvoiceRequest: false,
  month: { state: "Not Raised", invoiceCount: 0, raisedInvoiceCount: 0, raisedAmountINR: 0, draftInvoiceCount: 0, cancelledInvoiceCount: 0 }, ...over,
});
const page = (items, over = {}) => ({ month: "2026-03", items, page: 1, pageSize: 25, total: items.length, totalPages: 1, summary: { projectCount: 10, projectsRaised: 2, projectsNotRaised: 8, invoiceCount: 8, invoicesRaised: 5, raisedAmountINR: 6800, byStatus: { raised: 2, partiallyPaid: 2, paid: 1, draft: 2, cancelled: 1 }, approvalPendingCount: 1 }, ...over });

test("table: one main row per project with the requested columns, Not Raised, the Repository badge and the + indicator", async () => {
  const { TrackerTable } = await load("/src/pages/InvoiceTracker/InvoiceTracker.tsx");
  const items = [
    row(1, { month: { state: "Raised", invoiceCount: 6, raisedInvoiceCount: 4, raisedAmountINR: 6300, draftInvoiceCount: 1, cancelledInvoiceCount: 1 } }),
    row(2, { hasOpenInvoiceRequest: true }),
    row(3, { pendingDueINR: 2_000_000 }),
    row(4, { pendingDueINR: 0 }),
  ];
  const html = renderToStaticMarkup(h(MemoryRouter, null, h(TrackerTable, { data: page(items), month: "2026-03", expanded: new Set(), onToggle() {}, renderChain: () => "CHAIN" })));
  for (const col of ["S. No.", "PR No.", "Client Name", "Project Title", "WO Value", "Invoice Status", "This month", "Actions"]) assert.ok(html.includes(col), col);
  assert.equal((html.match(/data-project=/g) ?? []).length, 4, "one row per project");
  assert.equal(html.includes("CHAIN"), false, "chains are not rendered until a row is expanded");
  assert.match(html, /Raised · 4 invoices/);
  assert.equal((html.match(/>Not Raised</g) ?? []).length, 3);
  assert.equal((html.match(/New invoice request has been sent for approval\./g) ?? []).length, 1, "the + indicator only where a request is open");
  // The Repository badge is the shared rule: invoiced share of WO value — not payment.
  assert.deepEqual(["Partially Paid", "Not Started", "Paid"], [html.match(/>(Partially Paid)</)?.[1], html.match(/>(Not Started)</)?.[1], html.match(/>(Paid)</)?.[1]]);
  assert.match(html, /href="\/projects\/edit\/p1\?tab=invoices"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Show invoices for PR-1"/);
});

test("table: expanding shows the chain under that project only; S. No. continues across pages", async () => {
  const { TrackerTable } = await load("/src/pages/InvoiceTracker/InvoiceTracker.tsx");
  const items = [row(26), row(27)];
  const html = renderToStaticMarkup(h(MemoryRouter, null, h(TrackerTable, { data: page(items, { page: 2, pageSize: 25, total: 52, totalPages: 3 }), month: "2026-03", expanded: new Set(["p27"]), onToggle() {}, renderChain: (id) => `CHAIN-OF-${id}` })));
  assert.equal((html.match(/CHAIN-OF-/g) ?? []).length, 1);
  assert.ok(html.includes("CHAIN-OF-p27") && !html.includes("CHAIN-OF-p26"));
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Hide invoices/);
  assert.ok(/>26</.test(html) && />27</.test(html), "page 2 starts at S. No. 26");
});

test("summary cards show the whole-month figures from the server", async () => {
  const { TrackerSummaryCards } = await load("/src/pages/InvoiceTracker/InvoiceTracker.tsx");
  const html = renderToStaticMarkup(h(TrackerSummaryCards, { data: page([]) }));
  assert.match(html, /data-stat="Projects"[^]*?>10</);
  assert.match(html, /data-stat="Invoices raised"[^]*?>5</);
  assert.match(html, /8 invoices dated this month in total/);
  assert.match(html, /₹[\s\u202f]?6,800/);
  assert.match(html, /2 · 2 · 1/);
  assert.match(html, /Draft 2, Cancelled 1/);
  assert.match(html, /data-stat="Awaiting approval \(\+\)"[^]*?>1</);
});

test("the Repository invoice status is ONE shared rule (invoiced share of WO value, not payment)", async () => {
  const { repositoryInvoiceSummary } = await load("/src/utils/repositoryInvoiceStatus.ts");
  assert.deepEqual(repositoryInvoiceSummary(1000, 1000), { pendingDue: 1000, invoiceStatus: "Not Started" });
  assert.deepEqual(repositoryInvoiceSummary(1000, 400), { pendingDue: 400, invoiceStatus: "Partially Paid" });
  assert.deepEqual(repositoryInvoiceSummary(1000, 0), { pendingDue: 0, invoiceStatus: "Paid" });
  assert.deepEqual(repositoryInvoiceSummary(1000, undefined), { pendingDue: 1000, invoiceStatus: "Not Started" }, "no server figure → nothing invoiced");
  assert.deepEqual(repositoryInvoiceSummary(undefined, undefined), { pendingDue: 0, invoiceStatus: "Not Started" });
  assert.deepEqual(repositoryInvoiceSummary(1000, -50), { pendingDue: -50, invoiceStatus: "Paid" });
  const projects = src("pages/Projects/Projects.tsx");
  assert.match(projects, /repositoryInvoiceSummary\(p\.workOrderValueINR, p\.backendPendingDueINR\)/, "Project Repository uses the shared rule");
  assert.match(projects, /<RepositoryInvoiceStatusBadge status=\{status\} \/>/, "…and the shared badge");
  assert.match(src("pages/InvoiceTracker/InvoiceTracker.tsx"), /repositoryInvoiceSummary\(p\.workOrderValueINR, p\.pendingDueINR\)/, "Invoice Tracker uses the same");
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

test("chain: invoices of the selected month are marked, older ones stay listed unmarked; an empty project says so", async () => {
  const { InvoiceChainView } = await load("/src/pages/InvoiceTracker/InvoiceChain.tsx");
  const render = (invoices) => renderToStaticMarkup(h(InvoiceChainView, { data: chainData(invoices), loading: false, canEdit: true, canDelete: true, onAction() {} }));
  const html = render([invoice({ key: "a", invoiceNo: "NEW-1", inSelectedMonth: true }), invoice({ key: "b", invoiceNo: "OLD-1", inSelectedMonth: false })]);
  assert.match(html, /NEW-1/);
  assert.match(html, /OLD-1/, "an older invoice is still listed");
  assert.equal((html.match(/Selected month/g) ?? []).length, 1, "only the selected month's invoice carries the badge");
  const newBlock = html.slice(html.indexOf('data-invoice="a"'), html.indexOf('data-invoice="b"'));
  assert.match(newBlock, /Selected month/);
  assert.match(html, /data-in-month="true"/);
  assert.match(html, /data-in-month="false"/);
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
  assert.match(text, /Total Projects/);
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
