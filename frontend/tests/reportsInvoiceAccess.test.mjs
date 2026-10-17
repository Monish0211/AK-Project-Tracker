// Reports invoice-access handling (Oct 2026): without Invoices access every
// invoice-derived figure says "Not available" — never ₹0 — while
// non-invoice figures stay visible; with access, genuine zeros stay zeros.
// Components are rendered server-side (no browser); React is imported
// natively, same as dateInputValidation.test.mjs.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
let React;
let renderToStaticMarkup;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

const NA = "Not available";

async function render(componentPath, exportName, props, available) {
  const mod = await load(componentPath);
  const { InvoiceAccessContext } = await load("/src/components/reports/Shared/invoiceAccess.ts");
  return renderToStaticMarkup(React.createElement(InvoiceAccessContext.Provider, { value: available }, React.createElement(mod[exportName], props)));
}

const analytics = {
  totalWOValue: 1000000,
  totalInvoiceRaised: 0,
  totalPaymentReceived: 0,
  totalOutstanding: 1000000,
  balanceToInvoice: 1000000,
  collectionPercent: 0,
  totalOrderedQty: 12,
  totalInvoicedQty: 0,
  remainingQty: 12,
  quantityCompletionPercent: 0,
  projectCounts: { total: 1 },
  invoiceCounts: { raised: 0, paid: 0 },
};

test("Financial cards: no access → Not available for every invoice KPI; access with zero invoices → genuine ₹ 0", async () => {
  const off = await render("/src/components/reports/Financial/FinancialCards.tsx", "FinancialCards", { analytics }, false);
  assert.equal(off.split(NA).length - 1, 4, "Raised, Received, Outstanding, Balance to Invoice");
  assert.match(off, /₹ 10 L/, "Work Order value still shown");
  assert.doesNotMatch(off, /₹ 0</, "no ₹0 masquerading as data");
  const on = await render("/src/components/reports/Financial/FinancialCards.tsx", "FinancialCards", { analytics }, true);
  assert.ok(!on.includes(NA));
  assert.match(on, /₹ 0</, "a real zero is still shown as ₹ 0 when access exists");
});

test("Customer and Commercial tabs: invoice KPIs not available, contract values shown", async () => {
  const customer = await render("/src/components/reports/CustomerAnalytics/CustomerAnalytics.tsx", "CustomerAnalytics", { analytics: { ...analytics, customerList: [{ client: "Acme", projectCount: 1, activeProjectCount: 1, woValue: 1000000, raised: null, received: null, outstanding: null, outstandingReceivable: null, expenses: 5000 }] } }, false);
  assert.ok(customer.split(NA).length - 1 >= 4, "2 KPI cards + 2 chart panels + table cells");
  assert.match(customer, /Client Revenue/);
  assert.match(customer, /Acme/);
  const commercial = await render("/src/components/reports/CommercialAnalytics/CommercialAnalytics.tsx", "CommercialAnalytics", { analytics, projects: [{ id: "p1", prNo: "PR-1", client: "Acme", workOrderValueINR: 1000000, invoiceItems: [] }] }, false);
  assert.match(commercial, /₹ 10 L/, "Total Contract Value shown");
  assert.ok(commercial.split(NA).length - 1 >= 5, "Invoiced, Unbilled, Billed %, milestone panel, table cells");
  assert.doesNotMatch(commercial, /0\.0%/, "Billed % is not computed from missing data");
});

test("Client tables: null invoice figures render as Not available; real values render normally", async () => {
  const rows = [
    { client: "NoAccess Co", projectCount: 2, woValue: 500000, raised: null, received: null, outstanding: null },
  ];
  for (const [path, name] of [["/src/components/reports/Financial/ClientFinancialTable.tsx", "ClientFinancialTable"], ["/src/components/reports/CustomerAnalytics/CustomerTable.tsx", "CustomerTable"]]) {
    const html = await render(path, name, { customerList: rows }, false);
    assert.match(html, /NoAccess Co/);
    assert.match(html, /₹ 5 L/, `${name}: WO value still shown`);
    assert.ok(html.includes(NA), `${name}: Not available`);
    assert.doesNotMatch(html, /0\.0%/, `${name}: no collection % from missing data`);
    const ok = await render(path, name, { customerList: [{ client: "Real Co", projectCount: 1, woValue: 500000, raised: 0, received: 0, outstanding: 500000 }] }, true);
    assert.ok(!ok.includes(NA));
    assert.match(ok, /₹ 0</, `${name}: genuine zero kept`);
  }
});

test("Quantity tab: contracted quantities stay visible without invoice access; invoiced figures not available", async () => {
  const projects = [{ id: "p1", prNo: "PR-1", client: "Acme", projectTitle: "T", invoiceItems: [], quantityItems: [{ id: "q1", description: "Engineering hours", uom: "HRS", woQty: 12 }] }];
  const table = await render("/src/components/reports/QuantityAnalytics/QuantityTable.tsx", "QuantityTable", { projects }, false);
  assert.match(table, /Engineering hours/, "activity listed from live quantity items");
  assert.match(table, />12</, "ordered quantity shown");
  assert.ok(table.includes(NA));
  const tab = await render("/src/components/reports/QuantityAnalytics/QuantityAnalytics.tsx", "QuantityAnalytics", { projects, analytics }, false);
  assert.ok(tab.split(NA).length - 1 >= 5, "3 KPI cards + 2 chart panels (+ table)");
  assert.match(tab, /Total Contracted Quantity/);
  const withAccess = await render("/src/components/reports/QuantityAnalytics/QuantityTable.tsx", "QuantityTable", { projects: [{ ...projects[0], invoiceItems: [{ id: "q1", description: "Engineering hours", qty: 12, uom: "HRS", invoices: [{ status: "Paid", quantityBilled: 0 }] }] }] }, true);
  assert.ok(!withAccess.includes(NA));
});

test("Executive chart: Invoice Raised series and title removed, with an explicit note", async () => {
  const props = { projects: [{ prNo: "PR-1", workOrderValueINR: 1000, invoiceItems: [], resources: [], nonManhourExpenses: [] }], analytics: { projectCounts: { active: 1, completed: 0, hold: 0, cancelled: 0, total: 1 } } };
  const off = await render("/src/components/reports/ExecutiveSummary/ExecutiveSummaryCharts.tsx", "ExecutiveSummaryCharts", props, false);
  assert.match(off, /WO vs Expenses/);
  assert.match(off, /Invoice Raised: <strong>Not available<\/strong>/);
  const on = await render("/src/components/reports/ExecutiveSummary/ExecutiveSummaryCharts.tsx", "ExecutiveSummaryCharts", props, true);
  assert.match(on, /WO vs Raised vs Expenses/);
  assert.ok(!on.includes(NA));
});
