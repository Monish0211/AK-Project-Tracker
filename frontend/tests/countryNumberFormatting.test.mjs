// Country-based financial number formatting: India keeps the Indian convention (Lakh / Crore) exactly as before; every other country abbreviates internationally
// (K / M / B). The convention follows the PROJECT'S COUNTRY (its stored PR Category), never the user's selected country, locale or the currency alone. Presentation
// only: amounts, calculations and stored values are never touched.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
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
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

// Projects as the screens hold them: the stored country is the PR Category ("FZI" is FZE's stored key).
const COUNTRY = {
  India: { prCategory: "India", regionalCurrency: "INR" },
  Malaysia: { prCategory: "Malaysia", regionalCurrency: "MYR" },
  Oman: { prCategory: "Oman", regionalCurrency: "OMR" },
  "Abu Dhabi": { prCategory: "Abu Dhabi", regionalCurrency: "AED" },
  FZE: { prCategory: "FZI", regionalCurrency: "AED" },
  "Elixir Qatar": { prCategory: "Elixir Qatar", regionalCurrency: "QAR" },
  Qatar: { prCategory: "Qatar", regionalCurrency: "QAR" },
};

test("the brief's examples, per country, through the project's own formatter", async () => {
  const { projectMoney } = await load("/src/utils/currencyDisplay.ts");
  const { formatBusinessINR } = await load("/src/utils/formatCurrency.ts");
  const compact = (country, amount) => projectMoney(COUNTRY[country]).compact(amount);
  // International: K / M / B with no space; the symbol or code keeps the existing form.
  assert.equal(compact("Malaysia", 43_200), "RM 43.2K");
  assert.equal(compact("Oman", 125_000), "OMR 125K");
  assert.equal(compact("Abu Dhabi", 52_850), "AED 52.85K");
  assert.equal(compact("FZE", 1_250_000), "AED 1.25M");
  assert.equal(compact("Elixir Qatar", 125_000), "QAR 125K");
  assert.equal(compact("Qatar", 1_250_000), "QAR 1.25M");
  // India: the long-standing Indian formatter, byte for byte (Lakh / Crore written L / Cr, as the app has always shown them).
  assert.equal(compact("India", 125_000), formatBusinessINR(125_000));
  assert.equal(compact("India", 125_000), "₹ 1.25 L");
  assert.equal(compact("India", 12_500_000), "₹ 1.25 Cr");
  assert.equal(compact("India", 1_250_000), "₹ 12.5 L");
  assert.equal(compact("India", 125_000_000), "₹ 12.5 Cr");
});

test("international abbreviations: 1,000 = 1K ... 1,000,000,000 = 1B, at most two decimals, no trailing zeros", async () => {
  const { formatMoneyCompact } = await load("/src/utils/currencyDisplay.ts");
  const c = (v) => formatMoneyCompact(v, "AED");
  assert.equal(c(1_000), "AED 1K");
  assert.equal(c(10_000), "AED 10K");
  assert.equal(c(52_850), "AED 52.85K");
  assert.equal(c(125_000), "AED 125K");
  assert.equal(c(1_000_000), "AED 1M");
  assert.equal(c(1_250_000), "AED 1.25M");
  assert.equal(c(1_000_000_000), "AED 1B");
  assert.equal(c(2_340_000_000), "AED 2.34B");
  assert.equal(c(12_345), "AED 12.35K", "two decimals, rounded");
  assert.equal(formatMoneyCompact(125_000, "OMR"), "OMR 125K");
  assert.equal(formatMoneyCompact(3_696.5, "OMR"), "OMR 3.7K");
});

test("zero, negative, small decimal, missing and non-finite values", async () => {
  const { formatMoneyCompact, projectMoney } = await load("/src/utils/currencyDisplay.ts");
  assert.equal(formatMoneyCompact(0, "AED"), "AED 0");
  assert.equal(formatMoneyCompact(-52_850, "AED"), "-AED 52.85K", "the sign comes first");
  assert.equal(formatMoneyCompact(-1_250_000, "QAR"), "-QAR 1.25M");
  assert.equal(formatMoneyCompact(-43_200, "MYR"), "-RM 43.2K");
  assert.equal(formatMoneyCompact(0.5, "AED"), "AED 0.5");
  assert.equal(formatMoneyCompact(12.5, "AED"), "AED 12.5");
  assert.equal(formatMoneyCompact(999, "AED"), "AED 999");
  assert.equal(formatMoneyCompact(0.1234, "OMR"), "OMR 0.123", "OMR keeps its three decimals below 1,000");
  assert.equal(formatMoneyCompact(Number.NaN, "AED"), "AED 0");
  assert.equal(formatMoneyCompact(Number.POSITIVE_INFINITY, "OMR"), "OMR 0");
  const money = projectMoney(COUNTRY["Abu Dhabi"]);
  assert.equal(money.compact(undefined), "AED 0", "a missing value reads zero through the project formatter");
  assert.equal(money.compact(null), "AED 0");
  assert.equal(money.compact(-0), "AED 0", "no negative zero");
});

test("rounding boundaries never print 1000K or 1000M: the next unit takes over", async () => {
  const { formatMoneyCompact } = await load("/src/utils/currencyDisplay.ts");
  const c = (v) => formatMoneyCompact(v, "AED");
  assert.equal(c(999_994), "AED 999.99K");
  assert.equal(c(999_996), "AED 1M");
  assert.equal(c(999_999), "AED 1M");
  assert.equal(c(999_994_999), "AED 999.99M");
  assert.equal(c(999_999_999), "AED 1B");
  assert.equal(c(999.996), "AED 1K");
  assert.equal(c(1_000), "AED 1K");
  assert.equal(c(1_004), "AED 1K", "1.004K rounds to 1K");
  assert.equal(c(1_006), "AED 1.01K", "1.006K rounds up to 1.01K");
});

test("the country decides the convention: India Indian; every other country international (no country list is kept); names and codes both resolve", async () => {
  const { numberingSystemForCountry } = await load("/src/utils/currencyDisplay.ts");
  assert.equal(numberingSystemForCountry("India", "INR"), "indian");
  assert.equal(numberingSystemForCountry("india"), "indian", "a report group carries the lower-case code");
  for (const country of ["Malaysia", "Oman", "Abu Dhabi", "abu-dhabi", "FZI", "FZE", "fze", "Elixir Qatar", "elixir-qatar", "Qatar", "qatar"]) {
    assert.equal(numberingSystemForCountry(country, "INR"), "international", `${country} is international even if a stray currency said INR`);
  }
  // A legacy project with no recognised country falls back to its currency.
  assert.equal(numberingSystemForCountry(null, "INR"), "indian");
  assert.equal(numberingSystemForCountry(undefined, undefined), "indian");
  assert.equal(numberingSystemForCountry("", "OMR"), "international");
  // The "no country" markers a report group carries (and a project with no category) fall back to the currency too.
  assert.equal(numberingSystemForCountry("none", "INR"), "indian");
  assert.equal(numberingSystemForCountry("category:Legacy", "INR"), "indian");
  assert.equal(numberingSystemForCountry("none", "AED"), "international");
});

test("countries that share a currency stay separate countries and read the same way; Indian Lakh / Crore never appears on a non-India amount", async () => {
  const { projectMoney, moneyFormatter } = await load("/src/utils/currencyDisplay.ts");
  for (const [a, b] of [["Abu Dhabi", "FZE"], ["Elixir Qatar", "Qatar"]]) {
    assert.notEqual(COUNTRY[a].prCategory, COUNTRY[b].prCategory, "separate country classifications");
    assert.equal(COUNTRY[a].regionalCurrency, COUNTRY[b].regionalCurrency, "the same currency");
    for (const amount of [1_000, 52_850, 125_000, 1_250_000, 12_500_000, 250_000_000]) {
      assert.equal(projectMoney(COUNTRY[a]).compact(amount), projectMoney(COUNTRY[b]).compact(amount));
    }
  }
  for (const country of Object.keys(COUNTRY).filter((c) => c !== "India")) {
    for (const amount of [125_000, 1_250_000, 12_500_000, 125_000_000, 1_250_000_000]) {
      const text = projectMoney(COUNTRY[country]).compact(amount);
      assert.doesNotMatch(text, /Lakh|\bL\b|\bCr\b|₹/, `${country}: ${text}`);
    }
  }
  // An INR-denominated amount shown for a non-India project is not abbreviated in Lakh / Crore either.
  assert.doesNotMatch(moneyFormatter("INR", "Oman").compact(12_500_000), /Lakh|\bL\b|\bCr\b/);
  assert.equal(moneyFormatter("INR", "India").compact(12_500_000), "₹ 1.25 Cr");
  assert.equal(moneyFormatter("INR").compact(12_500_000), "₹ 1.25 Cr", "no country = the long-standing INR behaviour");
});

test("India is byte-for-byte unchanged: the compact, full and exact INR formats are the original formatters, whatever the country argument", async () => {
  const { moneyFormatter, projectMoney, formatMoneyCompact, formatMoney } = await load("/src/utils/currencyDisplay.ts");
  const { formatBusinessINR, formatFullINR, formatIndianCurrency } = await load("/src/utils/formatCurrency.ts");
  for (const value of [0, 1, 999, 1_000, 25_000, 99_999, 100_000, 125_000, 9_999_999, 12_500_000, 125_000_000, -125_000, 1_234_567.891]) {
    for (const f of [moneyFormatter("INR"), moneyFormatter("INR", "India"), moneyFormatter(null, "india"), projectMoney(COUNTRY.India), projectMoney({})]) {
      assert.equal(f.compact(value), formatBusinessINR(value), `compact ${value}`);
      assert.equal(f.full(value), formatFullINR(value), `full ${value}`);
      assert.equal(f.exact(value), formatIndianCurrency(value), `exact ${value}`);
    }
    assert.equal(formatMoneyCompact(value, "INR"), formatBusinessINR(value));
    assert.equal(formatMoney(value, "INR"), formatIndianCurrency(value));
  }
});

test("the full and exact amounts of every country are exactly what they were (only the abbreviated form changed)", async () => {
  const { projectMoney } = await load("/src/utils/currencyDisplay.ts");
  assert.equal(projectMoney(COUNTRY.Malaysia).full(43_200), "RM 43,200.00");
  assert.equal(projectMoney(COUNTRY.Oman).full(3_696), "OMR 3,696.000");
  assert.equal(projectMoney(COUNTRY["Abu Dhabi"]).exact(35_232), "AED 35,232.00");
  assert.equal(projectMoney(COUNTRY.Qatar).full(1_250_000), "QAR 1,250,000.00");
});

test("the convention follows the project, not the user: the selected country, login country and locale are never inputs", async () => {
  const { projectMoney } = await load("/src/utils/currencyDisplay.ts");
  // The formatter is a pure function of the project (country + currency) and the amount. The same Qatar project reads the same under any selector value.
  const qatar = projectMoney(COUNTRY.Qatar);
  const before = qatar.compact(1_250_000);
  globalThis.localStorage = { ...globalThis.localStorage, getItem: (k) => (k === "activeCountry" ? "india" : null) };
  assert.equal(projectMoney(COUNTRY.Qatar).compact(1_250_000), before);
  assert.equal(before, "QAR 1.25M");
  const text = readFileSync(new URL("../src/utils/currencyDisplay.ts", import.meta.url), "utf8");
  assert.ok(!/activeCountry|navigator\.language|Intl\.NumberFormat|localStorage|useCountry/.test(text.split("export function formatMoneyCompact")[0] + text.split("export function moneyFormatter")[1]), "no selector, locale or storage is read by the formatters");
});

test("Dashboard, Reports and the Project Repository format a project's amount identically (one shared formatter)", async () => {
  const { projectMoney, moneyFormatter } = await load("/src/utils/currencyDisplay.ts");
  for (const [name, project] of Object.entries(COUNTRY)) {
    const reportKey = { India: "india", Malaysia: "malaysia", Oman: "oman", "Abu Dhabi": "abu-dhabi", FZE: "fze", "Elixir Qatar": "elixir-qatar", Qatar: "qatar" }[name];
    for (const amount of [0, 999, 1_000, 52_850, 125_000, 1_250_000, 12_500_000]) {
      const repository = projectMoney(project).compact(amount); // Project Repository / project screens
      const reports = moneyFormatter(project.regionalCurrency, reportKey).compact(amount); // a Reports section (group country key + currency)
      const dashboard = moneyFormatter(project.regionalCurrency).compact(amount); // Dashboard KPI (currency group)
      assert.equal(reports, repository, `${name} ${amount}: Reports = Repository`);
      assert.equal(dashboard, repository, `${name} ${amount}: Dashboard = Repository`);
    }
  }
  // Wiring: the report sections get the group's country key, and projectMoney reads the project's PR Category.
  assert.match(src("components/reports/reportCurrencyContext.ts"), /moneyFormatter\(currency, countryKey\)/);
  assert.match(src("pages/ReportsPage.tsx"), /countryKey: group\.countryKey/);
  assert.match(src("utils/currencyDisplay.ts"), /moneyFormatter\(regionalCurrencyOf\(project\), project\?\.prCategory\)/);
});

test("nothing that must not be abbreviated goes through the compact formatter, and exports keep numbers, not abbreviated text", () => {
  // Identifiers, dates, quantities and exchange rates are formatted by their own code: the compact formatter is only ever called on money.
  for (const file of ["pages/Projects/components/ExpandableTeamMembersCard.tsx", "services/expenseBudgetAnalysisService.ts"]) {
    const text = src(file);
    assert.ok(!/compact\([^)]*(prNo|employeeNo|invoiceNo|workOrderNo|hours|exchangeRate)/i.test(text), `${file}: compact() is never applied to an identifier, hours or a rate`);
  }
  // Excel / CSV exports write the underlying numbers; no export builder calls a compact money formatter.
  for (const file of ["utils/reportRegistryRows.ts", "components/reports/reportCurrency.ts"]) {
    assert.ok(!/\.compact\(|formatMoneyCompact|formatBusinessINR/.test(src(file)), `${file}: exports do not carry abbreviated strings`);
  }
});

test("an amount input leaves room for its currency glyph: ₹ little, RM more, AED / OMR / QAR the most, so the placeholder never sits under the code", async () => {
  const { currencyInputPadding, currencyPrefix } = await load("/src/utils/currencyDisplay.ts");
  assert.equal(currencyInputPadding("INR"), "pl-7");
  assert.equal(currencyInputPadding("MYR"), "pl-9");
  for (const currency of ["AED", "OMR", "QAR", "USD", "EUR"]) assert.equal(currencyInputPadding(currency), "pl-12", currency);
  // The padding is wider for a wider glyph, always.
  const widths = ["INR", "MYR", "AED"].map((c) => currencyPrefix(c).length);
  assert.ok(widths[0] < widths[1] && widths[1] < widths[2]);
  const card = src("pages/Projects/components/ExpenseBudgetCard.tsx");
  assert.equal((card.match(/className=\{currencyInputPadding\(regionalCurrency\)\}/g) ?? []).length, 2, "both budget amount inputs use it");
  assert.ok(!/className="pl-7"/.test(card), "no input is left with the one-character padding");
});

test("Quantity Details: the Currency and Exchange Rate fields are top-aligned, so their labels line up even though the rate column has a helper line", () => {
  const quantity = src("pages/Projects/components/QuantityCard.tsx");
  assert.match(quantity, /<div className="flex flex-wrap items-start gap-3">\s*<div className="w-32">\s*<FormLabel required=\{true\}[^>]*>\s*Currency/);
  assert.ok(!/flex flex-wrap items-end gap-3">\s*<div className="w-32">/.test(quantity), "the row is no longer bottom-aligned");
});
