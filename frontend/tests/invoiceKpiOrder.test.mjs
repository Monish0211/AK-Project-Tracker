// Invoice Management KPI row (Oct 2026): "Contract Value" is shown as "Work Order Value", and the six cards appear in the order
//   Work Order Value, Invoice Raised, Balance to Invoice, Payment Received, Outstanding, Total Activities.
// Presentation only — every figure still comes from calculateProjectKPIs(), so each label must keep its own value. The row is ONE shared
// component (CommercialSummary), rendered by InvoiceDashboard for both Edit Project (via ProjectForm → InvoiceCard) and View Project
// (via InvoiceProgressView), so rendering it covers both screens; the wiring tests below pin that.
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

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

// WO value 10,00,000; Raised 2,50,000 + Paid 1,00,000 => Raised 3,50,000, Received 1,00,000, Balance 6,50,000, Outstanding 2,50,000.
const fixture = (base) => ({
  ...base,
  invoiceItems: [
    {
      id: "a1",
      totalPrice: 1_000_000,
      invoices: [
        { id: "l1", status: "Raised", invoiceAmountINR: 250_000 },
        { id: "l2", status: "Paid", invoiceAmountINR: 100_000 },
      ],
    },
  ],
});

async function renderTiles() {
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  const { CommercialSummary } = await load("/src/pages/Projects/components/Invoice/CommercialSummary.tsx");
  const { calculateProjectKPIs } = await load("/src/pages/Projects/components/Invoice/InvoiceCalculations.ts");
  const { formatBusinessINR } = await load("/src/utils/formatCurrency.ts");
  const project = fixture(createEmptyProject());
  const html = renderToStaticMarkup(React.createElement(CommercialSummary, { project }));
  // Each tile prints its label in an uppercase <p>; its value follows (inside a tooltip <span> + icon, hence the tag stripping) up to the next tile.
  const marks = [...html.matchAll(/uppercase tracking-wide truncate mb-0\.5">([^<]+)<\/p>/g)];
  const tiles = marks.map((m, i) => {
    // The next tile starts at its own wrapper <div class="relative ...">, which precedes its label.
    const end = i + 1 < marks.length ? html.lastIndexOf('<div class="relative', marks[i + 1].index) : html.length;
    const text = html.slice(m.index + m[0].length, end).replace(/<[^>]*>/g, " ").replace(/Updated from Projects/g, " ").replace(/\s+/g, " ").trim();
    return { label: m[1], value: text };
  });
  return { html, tiles, kpis: calculateProjectKPIs(project), formatBusinessINR };
}

test("the six cards are in the requested order, with Contract Value renamed to Work Order Value", async () => {
  const { tiles } = await renderTiles();
  assert.deepEqual(
    tiles.map((t) => t.label),
    ["Work Order Value", "Invoice Raised", "Balance to Invoice", "Payment Received", "Outstanding", "Total Activities"]
  );
});

test("the old label is gone from the row", async () => {
  const { html } = await renderTiles();
  assert.ok(!html.includes("Contract Value"));
  assert.ok(html.includes("Work Order Value"));
});

test("every card keeps its own figure — only the position and one label changed", async () => {
  const { tiles, kpis, formatBusinessINR } = await renderTiles();
  // The fixture's five figures are all different, so a swapped pair could not hide.
  assert.deepEqual(
    [kpis.projectValueINR, kpis.totalInvoiceRaised, kpis.pendingDue, kpis.totalPaymentReceived, kpis.outstandingCollection],
    [1_000_000, 350_000, 650_000, 100_000, 250_000]
  );
  const byLabel = Object.fromEntries(tiles.map((t) => [t.label, t.value]));
  assert.equal(byLabel["Work Order Value"], formatBusinessINR(1_000_000));
  assert.equal(byLabel["Invoice Raised"], formatBusinessINR(350_000));
  assert.equal(byLabel["Balance to Invoice"], formatBusinessINR(650_000));
  assert.equal(byLabel["Payment Received"], formatBusinessINR(100_000));
  assert.equal(byLabel["Outstanding"], formatBusinessINR(250_000));
  assert.equal(byLabel["Total Activities"], "1");
  assert.equal(new Set(Object.values(byLabel)).size, 6, "six different values");
});

test("both screens render this one component: Edit Project (ProjectForm → InvoiceCard) and View Project (InvoiceProgressView) → InvoiceDashboard → CommercialSummary", () => {
  assert.match(src("pages/Projects/components/Invoice/InvoiceDashboard.tsx"), /<CommercialSummary project=\{project\} \/>/);
  assert.match(src("pages/Projects/components/InvoiceCard.tsx"), /<InvoiceDashboard/);
  assert.match(src("pages/Projects/components/InvoiceProgressView.tsx"), /<InvoiceDashboard project=\{project\} readOnly \/>/);
  assert.match(src("pages/Projects/components/ProjectForm.tsx"), /<InvoiceCard/);
  assert.match(src("pages/Projects/ViewProject.tsx"), /<InvoiceProgressView project=\{project\} \/>/);
});
