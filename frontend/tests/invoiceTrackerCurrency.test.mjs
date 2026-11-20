// Invoice Tracker across countries: every amount is written in its project's own currency; a total spanning countries is shown per currency, never added up.
// An India-only figure reads exactly as it always did.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let fmt;
before(async () => {
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
  fmt = await vite.ssrLoadModule("/src/pages/InvoiceTracker/trackerFormat.ts");
});
after(() => vite?.close());
const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");

test("an amount is written in its own currency; INR is the long-standing rupee format", () => {
  assert.equal(fmt.trackerMoney(50000), "₹ 50,000.00");
  assert.equal(fmt.trackerMoney(50000, "INR"), "₹ 50,000.00");
  assert.equal(fmt.trackerMoney(231, "OMR"), "OMR 231.000");
  assert.equal(fmt.trackerMoney(4200, "MYR"), "RM 4,200.00");
  assert.equal(fmt.trackerMoney(1200, "AED"), "AED 1,200.00");
  assert.equal(fmt.trackerMoney(3640, "QAR"), "QAR 3,640.00");
});

test("a total across countries is one figure per currency: INR first, then alphabetical, joined - never one sum", () => {
  const text = fmt.formatByCurrency({ QAR: 3950, INR: 50000, OMR: 231, AED: 1200 });
  assert.equal(text, "₹ 50,000.00 · AED 1,200.00 · OMR 231.000 · QAR 3,950.00");
  assert.ok(!/55,/.test(text), "no figure that adds currencies together");
});

test("an India-only total reads exactly as before, and nothing at all reads as zero rupees", () => {
  assert.equal(fmt.formatByCurrency({ INR: 123456.5 }), "₹ 1,23,456.50");
  assert.equal(fmt.formatByCurrency({}), "₹ 0.00");
  assert.equal(fmt.formatByCurrency(undefined), "₹ 0.00");
  assert.equal(fmt.formatByCurrency(undefined, 99), "₹ 99.00");
  assert.equal(fmt.hasAmount({ OMR: 0, INR: 0 }), false);
  assert.equal(fmt.hasAmount({ OMR: 38.5 }), true);
});

test("the tracker screens take their currency from the data and keep no rupee-only formatting for invoice amounts", () => {
  for (const file of ["InvoiceTracker.tsx", "InvoiceChain.tsx", "OutstandingView.tsx", "RaisedBreakdown.tsx"]) {
    const text = src(`pages/InvoiceTracker/${file}`);
    assert.ok(!/formatIndianCurrency/.test(text), `${file} must not format an invoice amount as rupees directly`);
  }
  const tables = src("pages/Settings/components/weeklyEmails/WeeklyEmailTables.tsx");
  assert.match(tables, /money\(x\.invoiceAmountINR, x\.currency\)/);
  assert.match(tables, /outstandingText\(summary\)/);
});

// ---- KPI cards with several currencies (UI only: the same figures and order, one row per currency) -----------------------------------------------------------------
test("currencyLines carries exactly the figures formatByCurrency joins, in the same order, and stripCurrencyPrefix only removes the leading symbol or code", () => {
  const by = { QAR: 3950, INR: 50000, OMR: 231, AED: 1200, MYR: 4200 };
  const lines = fmt.currencyLines(by);
  assert.deepEqual(lines.map((l) => l.currency), ["INR", "AED", "MYR", "OMR", "QAR"]);
  assert.equal(lines.map((l) => l.text).join(" · "), fmt.formatByCurrency(by), "same figures, same order as the joined string");
  assert.deepEqual(fmt.currencyLines({}), [{ currency: "INR", text: "₹ 0.00" }]);
  assert.deepEqual(fmt.currencyLines(undefined, 99), [{ currency: "INR", text: "₹ 99.00" }]);
  assert.equal(fmt.stripCurrencyPrefix("OMR 231.000"), "231.000");
  assert.equal(fmt.stripCurrencyPrefix("RM 4,200.00"), "4,200.00");
  assert.equal(fmt.stripCurrencyPrefix("₹ 50,000.00"), "50,000.00");
  assert.equal(fmt.stripCurrencyPrefix("1,200.00"), "1,200.00");
});

test("a multi-currency card: the primary figure is one currency, the others are aligned rows beneath it, nothing is added, and the actionable card stays ONE button", async () => {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { StatCard } = await vite.ssrLoadModule("/src/pages/InvoiceTracker/StatCard.tsx");
  const { IndianRupee } = await import("lucide-react");
  const by = { INR: 50000, AED: 1200, MYR: 4200, OMR: 231, QAR: 3950 };
  const props = { label: "Outstanding", value: fmt.formatByCurrency(by), lines: fmt.currencyLines(by), accent: "amber", icon: IndianRupee };
  const html = renderToStaticMarkup(React.createElement(StatCard, props));
  assert.match(html, />₹ 50,000\.00</, "the primary figure is the first currency alone");
  assert.doesNotMatch(html, /₹ 50,000\.00 · AED/, "no long joined string");
  assert.equal((html.match(/data-currency-line="/g) ?? []).length, 4, "one row for each other currency");
  for (const [code, amount] of [["AED", "1,200.00"], ["MYR", "4,200.00"], ["OMR", "231.000"], ["QAR", "3,950.00"]]) {
    const row = html.slice(html.indexOf(`data-currency-line="${code}"`));
    assert.match(row.slice(0, row.indexOf("</span></span>") + 14), new RegExp(`>${code}</span><span[^>]*>${amount.replace(".", "\\.")}</span>`), `${code} row`);
  }
  assert.match(html, /5 currencies · shown separately, never added/);
  const button = renderToStaticMarkup(React.createElement(StatCard, { ...props, onActivate() {}, actionLabel: "View breakdown", expanded: false }));
  assert.equal((button.match(/<button/g) ?? []).length, 1, "the rows inside an actionable card are plain spans: no nested control");
  assert.match(button, /data-currency-lines/);
  // One currency (or none): exactly the card as before - the single value, no rows, no caption.
  const single = renderToStaticMarkup(React.createElement(StatCard, { ...props, value: "₹ 50,000.00", lines: fmt.currencyLines({ INR: 50000 }) }));
  assert.match(single, /₹ 50,000\.00/);
  assert.doesNotMatch(single, /data-currency-line|currencies ·/);
  const none = renderToStaticMarkup(React.createElement(StatCard, { ...props, value: "₹ 0.00", lines: undefined }));
  assert.doesNotMatch(none, /data-currency-line/);
});

test("the three multi-currency tracker cards and the Outstanding tab card pass their per-currency figures to the card", () => {
  const tracker = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  assert.ok(tracker.includes("lines={currencyLines(s.raisedByCurrency, s.raisedAmountINR)}"));
  assert.ok(tracker.includes("lines={currencyLines(s.collected.byCurrency, s.collected.amountINR)}"));
  assert.ok(tracker.includes("lines={currencyLines(s.outstanding.knownByCurrency, s.outstanding.knownAmountINR)}"));
  assert.ok(src("pages/InvoiceTracker/OutstandingView.tsx").includes("lines={currencyLines(t.knownOutstandingByCurrency, t.knownOutstandingINR)}"));
  assert.ok(src("pages/InvoiceTracker/RaisedBreakdown.tsx").includes('<StatCard className={className} label="Raised invoice amount" value={value} lines={lines}'));
});
