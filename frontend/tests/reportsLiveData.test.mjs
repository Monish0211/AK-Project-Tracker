// Reports data consistency tests (Oct 2026).
// Run: npm test  (node:test + Vite's SSR module loader, same harness as the
// other frontend tests). The API is stubbed — no network, no browser cache.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    // projectService.ts imports the notification system, whose module body
    // defers engine.mount() (reads localStorage/getProjects) to a microtask —
    // fine in the browser, but under Vite's SSR loader that microtask runs
    // before projectService.ts finishes evaluating. Unrelated to Reports, so
    // the test server swaps it for an inert stub (app code is untouched).
    plugins: [
      {
        name: "stub-notification-service",
        enforce: "pre",
        load(id) {
          if (id.split("\\").join("/").endsWith("/src/notifications/notificationService.ts")) {
            return "export const notificationService = new Proxy({}, { get: () => () => undefined });";
          }
          return null;
        },
      },
    ],
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());

const PID = "p1";

/** A project as GET /projects + the stale browser mirror would hand it over: cached children that no longer match the server. */
function staleListProject(overrides = {}) {
  return {
    id: PID,
    prNo: "PR-QAFLOW-001",
    client: "QA Flow Client",
    projectTitle: "QA project",
    department: "Training",
    projectStatus: "Active",
    workOrderValueINR: 1005000, // computed from stale cached quantity items
    backendWorkOrderValueINR: 1205000, // server aggregate (authoritative)
    backendPendingDueINR: 655000,
    resources: [
      { id: "r-keep", employeeNo: "E1", manhourCost: 180000 },
      { id: "r-deleted", employeeNo: "X9", manhourCost: 40500 },
    ],
    nonManhourExpenses: [{ id: "e-old", category: "Travel", description: "old", quantity: 1, unitCost: 1, totalCost: 79500.5, remarks: "" }],
    quantityItems: [{ id: "q1", description: "Engineering", woQty: 10, unitRate: 100000, unitRateINR: 100000, woValue: 1000000, uom: "Nos", currency: "INR", exchangeRate: 1, invoiceQty: 0 }],
    invoiceItems: [{ id: "q1", description: "Engineering", qty: 10, uom: "Nos", unitPrice: 100000, totalPrice: 1000000, invoices: [{ id: "l2", status: "Raised", invoiceAmountINR: 200000 }] }],
    ...overrides,
  };
}

const LIVE = {
  resources: [{ id: "r-keep", projectId: PID, employeeNo: "E1", assignmentStartDate: null, assignmentEndDate: null, assignmentStatus: "Active", hourlyRateSnapshot: 1500, workingDays: 15, totalHours: 120, manhourCost: 180000 }],
  expenses: [
    { id: "e1", projectId: PID, category: "Travel", description: "Site visit", quantity: 2, unitCost: 12500, totalCost: 25000, remarks: null, importBatchId: null },
    { id: "e2", projectId: PID, category: "Software", description: "Licence", quantity: 1, unitCost: 54500.5, totalCost: 54500.5, remarks: "Annual", importBatchId: null },
    { id: "e3", projectId: PID, category: "Printing", description: "Added by another user", quantity: 1, unitCost: 10000, totalCost: 10000, remarks: null, importBatchId: null },
  ],
  quantity: [
    { id: "q0", projectId: PID, description: "QA flow activity", woQty: 5, invoiceQty: 0, pendingQty: 5, uom: "Nos", assignedTo: null, currency: "INR", unitRate: 1000, exchangeRate: 1, unitRateINR: 1000, woValue: 5000, pendingAmount: 5000, createdAt: "", updatedAt: "" },
    { id: "q1", projectId: PID, description: "Engineering", woQty: 12, invoiceQty: 3, pendingQty: 9, uom: "Nos", assignedTo: null, currency: "INR", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1200000, pendingAmount: 900000, createdAt: "", updatedAt: "" },
  ],
  lines: [
    { id: "l1", projectId: PID, quantityItemId: "q1", status: "Paid", invoiceAmountINR: 300000, invoiceDate: "2026-05-01T00:00:00.000Z", invoiceNo: "INV-1", quantityBilled: 1, currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: null },
    { id: "l2", projectId: PID, quantityItemId: "q1", status: "Paid", invoiceAmountINR: 200000, invoiceDate: "2026-06-01T00:00:00.000Z", invoiceNo: "INV-2", quantityBilled: 1, currency: "USD", exchangeRateToINR: 83, invoiceAmountOriginal: 2409.64 },
    { id: "l3", projectId: PID, quantityItemId: "q1", status: "Draft", invoiceAmountINR: 50000, invoiceDate: "2026-07-01T00:00:00.000Z", invoiceNo: "INV-3", quantityBilled: 1 },
    { id: "l4", projectId: PID, quantityItemId: "q1", status: "Cancelled", invoiceAmountINR: 99999, invoiceDate: "2026-07-15T00:00:00.000Z", invoiceNo: "INV-4", quantityBilled: 1 },
  ],
};

function paged(rows) {
  return (path) => {
    const m = /[?&]page=(\d+)&pageSize=(\d+)/.exec(path);
    const page = Number(m[1]);
    const size = Number(m[2]);
    return { items: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageSize: size };
  };
}

function deps({ lines = LIVE.lines, invoiceError = null, project = staleListProject(), live = LIVE } = {}) {
  const calls = [];
  const routes = {
    "/projects/resources": paged(live.resources),
    "/projects/expenses": paged(live.expenses),
    "/projects/quantity": paged(live.quantity),
  };
  return {
    calls,
    deps: {
      get: async (path) => {
        calls.push(path);
        const route = Object.keys(routes).find((r) => path.startsWith(r + "?"));
        if (!route) throw new Error("unexpected path " + path);
        return routes[route](path);
      },
      queryProjects: async (page) => {
        calls.push(`/projects?page=${page}`);
        return { items: page === 1 ? [project] : [], total: 1 };
      },
      fetchInvoiceLines: async () => {
        calls.push("/invoice-items");
        if (invoiceError) throw invoiceError;
        return lines;
      },
      getEmployees: () => [{ employeeNo: "E1", employeeName: "Arjun", designation: "Lead", manhourExpenses: 1500 }],
    },
  };
}

test("fetchAllPages walks every page and refuses to return a truncated list", async () => {
  const { fetchAllPages } = await load("/src/services/reportsLiveDataService.ts");
  const rows = Array.from({ length: 7 }, (_, i) => ({ i }));
  const res = await fetchAllPages((page) => Promise.resolve({ items: rows.slice((page - 1) * 3, page * 3), total: 7 }), "test");
  assert.equal(res.items.length, 7);
  assert.equal(res.requests, 3);
  await assert.rejects(fetchAllPages(() => Promise.resolve({ items: [], total: 5 }), "short"), /incomplete: received 0 of 5/);
});

test("live load replaces every stale cached collection and uses the server work order value", async () => {
  const { fetchLiveReportData } = await load("/src/services/reportsLiveDataService.ts");
  const { calls, deps: d } = deps();
  const live = await fetchLiveReportData(d);
  const [p] = live.projects;

  assert.deepEqual(p.resources.map((r) => r.id), ["r-keep"], "a resource deleted on the server is gone (replace, not merge)");
  assert.equal(p.resources[0].employeeName, "Arjun", "employee name still comes from the cached Employee Master list");
  assert.deepEqual(p.nonManhourExpenses.map((e) => e.id), ["e1", "e2", "e3"], "an expense added by another user appears; the stale cached row is gone");
  assert.deepEqual(p.quantityItems.map((q) => q.id), ["q0", "q1"]);
  assert.equal(p.workOrderValueINR, 1205000, "server aggregate wins over any locally computed figure");
  assert.equal(p.pendingAmount, 655000);

  const lines = p.invoiceItems.flatMap((i) => i.invoices);
  assert.deepEqual(lines.map((l) => [l.invoiceNo, l.status]), [["INV-1", "Paid"], ["INV-2", "Paid"], ["INV-3", "Draft"], ["INV-4", "Cancelled"]], "invoice status updates come from live lines");
  assert.equal(lines[1].currency, "USD");
  assert.equal(lines[0].invoiceDate, "2026-05-01");
  assert.deepEqual(live.invoiceLines, LIVE.lines);

  assert.ok(calls.includes("/projects/expenses?page=1&pageSize=500") && calls.includes("/projects/quantity?page=1&pageSize=500") && calls.includes("/projects/resources?page=1&pageSize=500"));
  assert.equal(live.requestCount, 5, "projects + resources + expenses + quantity + invoice lines, one page each");
});

test("an invoice line whose quantity item is not in the list is kept, never dropped from totals", async () => {
  const { fetchLiveReportData } = await load("/src/services/reportsLiveDataService.ts");
  const orphan = { id: "l9", projectId: PID, quantityItemId: "q-new", status: "Raised", invoiceAmountINR: 7000, invoiceDate: "2026-08-01", invoiceNo: "INV-9", quantityBilled: 1 };
  const { deps: d } = deps({ lines: [...LIVE.lines, orphan] });
  const [p] = (await fetchLiveReportData(d)).projects;
  const total = p.invoiceItems.flatMap((i) => i.invoices).filter((l) => l.status !== "Cancelled").reduce((a, l) => a + l.invoiceAmountINR, 0);
  assert.equal(total, 557000);
});

test("no Invoices access (403) → invoice data null, not zero; any other invoice failure aborts the load", async () => {
  const { fetchLiveReportData } = await load("/src/services/reportsLiveDataService.ts");
  const { ApiError } = await load("/src/services/apiClient.ts");
  const noAccess = await fetchLiveReportData(deps({ invoiceError: new ApiError(403, "Forbidden") }).deps);
  assert.equal(noAccess.invoiceLines, null);
  assert.deepEqual(noAccess.projects[0].invoiceItems, [], "no cached invoice lines leak through");
  assert.equal(noAccess.projects[0].nonManhourExpenses.length, 3, "everything else still loads");
  await assert.rejects(fetchLiveReportData(deps({ invoiceError: new ApiError(0, "Network error") }).deps), /Network error/);
  await assert.rejects(fetchLiveReportData(deps({ invoiceError: new ApiError(500, "Server") }).deps), /Server/);
});

test("registry row (table/CSV/Excel) reconciles exactly with the Project Financial Report PDF figures", async () => {
  const { fetchLiveReportData } = await load("/src/services/reportsLiveDataService.ts");
  const { buildRegistryRow } = await load("/src/utils/reportRegistryRows.ts");
  const { fetchProjectReportData } = await load("/src/services/projectReportDataService.ts");
  const { computeProjectFinancials } = await load("/src/utils/projectFinancials.ts");

  const [p] = (await fetchLiveReportData(deps().deps)).projects;
  const row = buildRegistryRow(p, true);

  // The PDF's own read-only service over the same server rows.
  const pdfData = await fetchProjectReportData(PID, {
    get: async (path) => {
      if (path === `/projects/${PID}`) return { id: PID, prNo: "PR-QAFLOW-001", workOrderValueINR: 1205000 };
      if (path.endsWith("/expenses")) return { items: LIVE.expenses };
      if (path.endsWith("/resources")) return { items: LIVE.resources };
      if (path.endsWith("/invoice-items")) return { items: LIVE.quantity.map((q) => ({ description: q.description, invoices: LIVE.lines.filter((l) => l.quantityItemId === q.id) })) };
      throw new Error(path);
    },
    getEmployees: () => [],
    now: () => new Date(),
  });
  const pdf = computeProjectFinancials({
    workOrderValueINR: pdfData.project.workOrderValueINR,
    manhourCosts: pdfData.manhourRows.map((r) => r.manhourCost),
    nonManhourRows: pdfData.nonManhourRows,
    invoiceLines: pdfData.invoiceRows,
  });

  const expected = { woValue: 1205000, raised: 550000, received: 500000, outstanding: 705000, expenses: 269500.5, profit: 935499.5 };
  for (const [k, v] of Object.entries(expected)) assert.equal(row[k], v, `table ${k}`);
  assert.deepEqual(
    [row.woValue, row.raised, row.received, row.outstanding, row.expenses, row.profit, row.profitPct],
    [pdf.workOrderValue, pdf.invoice.raised, pdf.invoice.received, pdf.invoice.outstanding, pdf.expenses, pdf.profit, pdf.profitPercent],
    "table and PDF agree on every figure"
  );
});

test("registry row: no invoice access → null invoice figures; WO 0 → null Profit %", async () => {
  const { buildRegistryRow } = await load("/src/utils/reportRegistryRows.ts");
  const base = staleListProject({ workOrderValueINR: 1000 });
  const noInv = buildRegistryRow(base, false);
  assert.equal(noInv.raised, null);
  assert.equal(noInv.received, null);
  assert.equal(noInv.outstanding, null);
  assert.equal(noInv.expenses, 300000.5, "expenses do not depend on invoice access");
  const zero = buildRegistryRow(staleListProject({ workOrderValueINR: 0 }), true);
  assert.equal(zero.profitPct, null);
  assert.equal(zero.profit, -300000.5);
});

test("CSV/Excel export keeps the column names and order; missing values export as blank cells", async () => {
  const XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
  const { sanitizeExportRows } = await load("/src/utils/sanitizeExportCell.ts");
  const { buildRegistryRow } = await load("/src/utils/reportRegistryRows.ts");
  const rows = [buildRegistryRow(staleListProject({ workOrderValueINR: 0 }), false)];
  // Exactly what ReportExportButtons does for both CSV and Excel.
  const ws = XLSX.utils.json_to_sheet(sanitizeExportRows(rows));
  const [header, line] = XLSX.utils.sheet_to_csv(ws).split("\n");
  // Existing columns unchanged; LD columns (Oct 2026) are appended after them.
  assert.equal(
    header,
    "id,prNo,client,projectTitle,department,status,woValue,raised,received,outstanding,expenses,profit,profitPct,ldStatus,ldAmount,finalProfit,finalProfitPct",
    "unchanged columns, LD appended"
  );
  assert.equal(line, "p1,PR-QAFLOW-001,QA Flow Client,QA project,Training,Active,0,,,,300000.5,-300000.5,,,,-300000.5,", "Not available / — / LD not recorded export as blanks");
  // Excel: write a real .xlsx and read it back, as a spreadsheet app would.
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sanitizeExportRows(rows)), "Report Data");
  const back = XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer" }).Sheets["Report Data"];
  const [headerRow, dataRow] = XLSX.utils.sheet_to_json(back, { header: 1, defval: "" });
  assert.deepEqual(headerRow, header.split(","), "Excel: same columns in the same order");
  assert.equal(dataRow[7], "", "Excel: raised cell is blank");
  assert.equal(dataRow[12], "", "Excel: profitPct cell is blank");
  assert.equal(dataRow[10], 300000.5, "Excel: numbers stay numeric");
});
