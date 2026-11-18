// Team Leads Workload: a lead's work order value is shown per currency, each in its country's number convention. A person with projects in several countries gets one
// amount per currency on its own line (never one added figure), a person whose projects are all outside the headline currency shows their own currency instead of 0,
// and an India-only person reads exactly as before.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
let React;
let renderToStaticMarkup;
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };

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
const entry = (currency, projects, total, formatted) => ({ currency, projects, totalWorkOrderValue: total, formattedWorkOrderValue: formatted });

test("an India-only lead reads exactly as before: the single INR string, no extra markup lines", async () => {
  const { LeadWorkOrderValue } = await load("/src/pages/Dashboard/components/LeadWorkOrderValue.tsx");
  const lead = { formattedWorkOrderValue: "₹ 10.00 L", totalsByCurrency: [entry("INR", 1, 1_000_000, "₹ 10.00 L")] };
  const html = renderToStaticMarkup(React.createElement(LeadWorkOrderValue, { lead }));
  assert.match(html, />₹ 10\.00 L</);
  assert.doesNotMatch(html, /lead-value-/, "a single currency has no per-currency lines");
});

test("a lead whose projects are all outside the headline currency shows their own currency, never ₹ 0", async () => {
  const { LeadWorkOrderValue } = await load("/src/pages/Dashboard/components/LeadWorkOrderValue.tsx");
  const lead = { formattedWorkOrderValue: "₹ 0", totalsByCurrency: [entry("QAR", 1, 12_000, "QAR 12K")] };
  const html = renderToStaticMarkup(React.createElement(LeadWorkOrderValue, { lead }));
  assert.match(html, /QAR 12K/);
  assert.doesNotMatch(html, /₹/);
});

test("a lead with projects in several countries shows one line per currency, each in its own convention, with nothing added across currencies", async () => {
  const { LeadWorkOrderValue } = await load("/src/pages/Dashboard/components/LeadWorkOrderValue.tsx");
  const lead = {
    formattedWorkOrderValue: "₹ 10.00 L",
    totalsByCurrency: [
      entry("INR", 1, 1_000_000, "₹ 10.00 L"),
      entry("OMR", 1, 3_696.5, "OMR 3.7K"),
      entry("MYR", 1, 43_200, "RM 43.2K"),
      entry("AED", 2, 55_232, "AED 55.23K"),
    ],
  };
  const html = renderToStaticMarkup(React.createElement(LeadWorkOrderValue, { lead }));
  for (const currency of ["INR", "OMR", "MYR", "AED"]) assert.match(html, new RegExp(`data-testid="lead-value-${currency}"`));
  assert.match(html, /OMR 3\.7K/);
  assert.match(html, /RM 43\.2K/);
  assert.match(html, /AED 55\.23K/);
  // The line order is the backend's: headline currency first.
  assert.ok(html.indexOf("lead-value-INR") < html.indexOf("lead-value-OMR"));
  // Non-India amounts never carry a rupee sign or Lakh / Crore.
  for (const code of ["OMR", "MYR", "AED"]) {
    const line = html.match(new RegExp(`data-testid="lead-value-${code}">([^<]*)<`))[1];
    assert.doesNotMatch(line, /₹|\bL\b|\bCr\b/, `${code}: ${line}`);
  }
});

test("the backend and the shared frontend formatter write the same abbreviation for the same amount (one convention, two places)", async () => {
  const { formatMoneyCompact } = await load("/src/utils/currencyDisplay.ts");
  // The same literals the backend test (teamLeadsWorkload.regional.test.ts and regionalCurrency.http.test.ts) asserts for formatCurrencyCompact.
  assert.equal(formatMoneyCompact(3_696.5, "OMR"), "OMR 3.7K");
  assert.equal(formatMoneyCompact(43_200, "MYR"), "RM 43.2K");
  assert.equal(formatMoneyCompact(35_232, "AED"), "AED 35.23K");
  assert.equal(formatMoneyCompact(20_000, "QAR"), "QAR 20K");
  assert.equal(formatMoneyCompact(2_500_000, "AED"), "AED 2.5M");
});

test("the widget and the View All page both render the per-currency component, and the type carries the new field", () => {
  assert.match(src("pages/Dashboard/components/TeamLeadsWorkloadWidget.tsx"), /<LeadWorkOrderValue lead=\{lead\} \/>/);
  assert.equal((src("pages/Dashboard/components/TeamLeadsWorkloadWidget.tsx").match(/<LeadWorkOrderValue lead=\{lead\} \/>/g) ?? []).length, 2, "desktop and mobile");
  assert.match(src("pages/Projects/TeamLeadsWorkloadProjects.tsx"), /<LeadWorkOrderValue lead=\{lead\} \/>/);
  assert.match(src("services/dashboardSummaryService.ts"), /totalsByCurrency: TeamLeadWorkloadValue\[\]/);
  for (const file of ["pages/Dashboard/components/TeamLeadsWorkloadWidget.tsx", "pages/Projects/TeamLeadsWorkloadProjects.tsx"]) {
    assert.ok(!/lead\.formattedWorkOrderValue/.test(src(file)), `${file} no longer shows the single headline-only string`);
  }
});
