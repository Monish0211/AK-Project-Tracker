// Liquidated Damages for a project in another country (Phase 4 final). The approved rule: LD is entered in the project's OWN currency (INR for India, exactly as before;
// MYR / OMR / AED / QAR otherwise) and a regional LD is deducted from that project's regional profit, never converted to or from INR. A LEGACY rupee LD recorded before
// regional LD existed (no currency) on a non-India project is never reinterpreted: it is shown as INR and not deducted. These tests pin that across the helpers, the PDF,
// the Excel export and the Reports basis, with India unchanged.
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
const COUNTRIES = [["India", "INR"], ["Malaysia", "MYR"], ["Oman", "OMR"], ["Abu Dhabi", "AED"], ["FZI", "AED"], ["Elixir Qatar", "QAR"], ["Qatar", "QAR"]];

test("India (INR): the LD is deducted from profit exactly as before", async () => {
  const { computeLdBreakdown } = await load("/src/utils/projectFinancials.ts");
  const yes = computeLdBreakdown({ workOrderValueINR: 1_000_000, expensesINR: 400_000, ldApplicable: true, ldAmountINR: 50_000 });
  assert.equal(yes.currency, "INR");
  assert.equal(yes.profitBeforeLd, 600_000);
  assert.equal(yes.ldDeduction, 50_000);
  assert.equal(yes.finalProfit, 550_000);
  assert.equal(yes.ldInrNotDeducted, null);
  assert.equal(yes.ldStatus, "Yes");
  const same = computeLdBreakdown({ workOrderValueINR: 1_000_000, expensesINR: 400_000, ldApplicable: true, ldAmountINR: 50_000, currency: "INR" });
  assert.deepEqual(same, yes, "an explicit INR currency changes nothing");
  const recordedInr = computeLdBreakdown({ workOrderValueINR: 1_000_000, expensesINR: 400_000, ldApplicable: true, ldAmountINR: 50_000, ldCurrency: "INR", ldAmountRegional: null, currency: "INR" });
  assert.deepEqual(recordedInr, yes, "a new India record (currency INR) reads exactly like a legacy one");
  assert.equal(computeLdBreakdown({ workOrderValueINR: 100, expensesINR: 0, ldApplicable: false, ldAmountINR: null }).ldDeduction, 0);
  assert.equal(computeLdBreakdown({ workOrderValueINR: 100, expensesINR: 0, ldApplicable: null, ldAmountINR: null }).ldDeduction, null, "not recorded stays not recorded");
  const big = computeLdBreakdown({ workOrderValueINR: 100_000, expensesINR: 0, ldApplicable: true, ldAmountINR: 150_000 });
  assert.equal(big.finalProfit, -50_000, "an INR LD may exceed profit, as before");
});

test("every non-India country: a regional LD is deducted from the regional profit, in its own currency, and no rupee amount appears", async () => {
  const { computeLdBreakdown } = await load("/src/utils/projectFinancials.ts");
  for (const [, currency] of COUNTRIES.filter(([, c]) => c !== "INR")) {
    const yes = computeLdBreakdown({ workOrderValueINR: 10_000, expensesINR: 1_000, ldApplicable: true, ldAmountINR: null, ldAmountRegional: 2_500, ldCurrency: currency, currency });
    assert.equal(yes.currency, currency);
    assert.equal(yes.profitBeforeLd, 9_000, `${currency}: the regional profit`);
    assert.equal(yes.ldDeduction, 2_500, `${currency}: the regional LD`);
    assert.equal(yes.finalProfit, 6_500, `${currency}: deducted in its own currency`);
    assert.equal(yes.ldInrNotDeducted, null, `${currency}: nothing is held back as a rupee figure`);
    assert.equal(yes.finalProfitPercent, 65);
    const over = computeLdBreakdown({ workOrderValueINR: 1_000, expensesINR: 0, ldApplicable: true, ldAmountINR: null, ldAmountRegional: 1_500, ldCurrency: currency, currency });
    assert.equal(over.finalProfit, -500, `${currency}: may exceed profit, like India`);
    const no = computeLdBreakdown({ workOrderValueINR: 10_000, expensesINR: 1_000, ldApplicable: false, ldAmountINR: null, currency });
    assert.equal(no.ldDeduction, 0);
    assert.equal(no.ldInrNotDeducted, null);
    const none = computeLdBreakdown({ workOrderValueINR: 10_000, expensesINR: 1_000, ldApplicable: null, ldAmountINR: null, currency });
    assert.equal(none.ldDeduction, null);
    assert.equal(none.ldStatus, "Not recorded");
  }
});

test("a LEGACY rupee LD on a non-India project is shown as INR and NOT deducted from the regional profit; a record in the wrong currency is not deducted either", async () => {
  const { computeLdBreakdown } = await load("/src/utils/projectFinancials.ts");
  for (const currency of ["MYR", "OMR", "AED", "QAR"]) {
    const legacy = computeLdBreakdown({ workOrderValueINR: 3_696, expensesINR: 396, ldApplicable: true, ldAmountINR: 5_000, currency });
    assert.equal(legacy.profitBeforeLd, 3_300);
    assert.equal(legacy.finalProfit, 3_300, `${currency}: no rupees subtracted from it`);
    assert.equal(legacy.ldDeduction, 0);
    assert.equal(legacy.ldInrNotDeducted, 5_000, `${currency}: the INR amount as recorded`);
    const wrong = computeLdBreakdown({ workOrderValueINR: 3_696, expensesINR: 396, ldApplicable: true, ldAmountINR: null, ldAmountRegional: 700, ldCurrency: currency === "OMR" ? "AED" : "OMR", currency });
    assert.equal(wrong.finalProfit, 3_300, `${currency}: another currency's amount is never subtracted`);
    assert.equal(wrong.ldInrNotDeducted, null);
  }
});

test("projectLdSummary: an India project is unchanged; a non-India project deducts its regional LD from its own regional profit", async () => {
  const { projectLdSummary } = await load("/src/utils/projectFinancials.ts");
  const india = projectLdSummary({ workOrderValueINR: 1_000_000, backendWorkOrderValueINR: 1_000_000, backendManhourCostINR: 250_000, backendNonManhourCostINR: 150_000, ldApplicable: true, ldAmountINR: 50_000 });
  assert.equal(india.currency, "INR");
  assert.equal(india.profitBeforeLd, 600_000);
  assert.equal(india.finalProfit, 550_000);
  const omanBase = {
    regionalCurrency: "OMR", workOrderValueINR: 0, workOrderValueRegional: 3_696, backendWorkOrderValueRegional: 3_696, backendManhourCostINR: 125_000, backendNonManhourCostINR: 420,
    resources: [{ manhourCost: 125_000, costingStatus: "CONVERTED", manhourCostRegional: 514.073 }, { manhourCost: 40_000, costingStatus: "RATE_MISSING", manhourCostRegional: null }],
  };
  const regional = projectLdSummary({ ...omanBase, ldApplicable: true, ldAmountINR: null, ldAmountRegional: 300, ldCurrency: "OMR" });
  assert.equal(regional.currency, "OMR");
  assert.equal(Number(regional.profitBeforeLd.toFixed(3)), 3_696 - 514.073 - 420, "regional WO less converted man-hour and other expenses");
  assert.equal(regional.ldDeduction, 300);
  assert.equal(Number(regional.finalProfit.toFixed(3)), Number((3_696 - 514.073 - 420 - 300).toFixed(3)));
  assert.equal(regional.ldInrNotDeducted, null);
  const legacy = projectLdSummary({ ...omanBase, ldApplicable: true, ldAmountINR: 5_000 });
  assert.equal(legacy.finalProfit, legacy.profitBeforeLd);
  assert.equal(legacy.ldInrNotDeducted, 5_000);
});

test("helpers: OMR keeps three decimals, the others two; recordedLdAmount and ldAmountFields never mix rupees with a regional figure", async () => {
  const { parseLdAmountInput, ldAmountFields, recordedLdAmount, ldDecimalsFor } = await load("/src/utils/liquidatedDamages.ts");
  assert.equal(parseLdAmountInput("123.456", "OMR").value, 123.456);
  assert.match(parseLdAmountInput("123.4567", "OMR").error, /three decimal/);
  assert.equal(parseLdAmountInput("12.34", "AED").value, 12.34);
  assert.match(parseLdAmountInput("12.345", "AED").error, /two decimal/);
  assert.match(parseLdAmountInput("12.345").error, /two decimal/, "INR keeps its original rule and wording");
  assert.equal(parseLdAmountInput("1,25,000.50").value, 125_000.5);
  assert.match(parseLdAmountInput("-5", "QAR").error, /greater than zero/);
  assert.equal(ldDecimalsFor("OMR"), 3);
  assert.equal(ldDecimalsFor("INR"), 2);
  assert.deepEqual(ldAmountFields(2_500, "AED"), { ldCurrency: "AED", ldAmountINR: null, ldAmountRegional: 2_500 });
  assert.deepEqual(ldAmountFields(50_000, "INR"), { ldCurrency: "INR", ldAmountINR: 50_000, ldAmountRegional: null });
  assert.deepEqual(ldAmountFields(null, "AED"), { ldCurrency: null, ldAmountINR: null, ldAmountRegional: null });
  assert.deepEqual(recordedLdAmount({ ldApplicable: true, ldAmountINR: null, ldAmountRegional: 2_500, ldCurrency: "AED" }, "AED"), { amount: 2_500, currency: "AED", legacyRupees: false });
  assert.deepEqual(recordedLdAmount({ ldApplicable: true, ldAmountINR: 5_000 }, "OMR"), { amount: 5_000, currency: "INR", legacyRupees: true });
  assert.deepEqual(recordedLdAmount({ ldApplicable: true, ldAmountINR: 50_000, ldCurrency: "INR" }, "INR"), { amount: 50_000, currency: "INR", legacyRupees: false });
  assert.equal(recordedLdAmount({ ldApplicable: false, ldAmountINR: null }, "AED"), null);
  assert.equal(recordedLdAmount({ ldApplicable: null }, "AED"), null);
});

test("screens: the amount reads in the currency it was recorded in, labelled; a legacy rupee amount is marked INR; India is unchanged", async () => {
  const { ldAmountText, ldAmountLabel } = await load("/src/utils/ldDisplay.ts");
  assert.equal(ldAmountLabel({ regionalCurrency: null, ldApplicable: true, ldAmountINR: 50_000 }), "LD Amount");
  assert.equal(ldAmountText({ regionalCurrency: null, prCategory: "India", ldApplicable: true, ldAmountINR: 50_000 }), "₹ 50,000.00");
  const regional = { regionalCurrency: "AED", prCategory: "Abu Dhabi", ldApplicable: true, ldAmountINR: null, ldAmountRegional: 2_500, ldCurrency: "AED" };
  assert.equal(ldAmountLabel(regional), "LD Amount (AED)");
  assert.equal(ldAmountText(regional), "AED 2,500.00");
  assert.equal(ldAmountText({ ...regional, regionalCurrency: "OMR", prCategory: "Oman", ldAmountRegional: 703.51, ldCurrency: "OMR" }), "OMR 703.510");
  const legacy = { regionalCurrency: "OMR", prCategory: "Oman", ldApplicable: true, ldAmountINR: 5_000 };
  assert.equal(ldAmountLabel(legacy), "LD Amount (INR)");
  assert.equal(ldAmountText(legacy), "₹ 5,000.00 (INR)");
  assert.equal(ldAmountText({ regionalCurrency: "OMR", prCategory: "Oman", ldApplicable: false }), "OMR 0.000", "No LD reads as a zero in the project's own currency");
});

// ── Project Financial PDF ────────────────────────────────────────────────

async function pdfText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => it.str).join(" ").replace(/\s+/g, " "));
  }
  await task.destroy();
  return pages.join("\n");
}

const pdfProject = (over) => ({
  id: "p1", prNo: "PR-LD", rfqNo: null, projectTitle: "LD project", client: "Client", department: "Process", domesticForeign: "Foreign", contractType: "LUMP SUM",
  projectStatus: "Completed", workOrderStatus: "Received", workOrderNumber: null, workOrderDate: null, projectStartDate: null, projectEndDate: null,
  actualCompletionDate: "2026-11-01", primaryProjectManager: null, secondaryProjectManager: null, pmoCoordinator: null, workOrderValueINR: 0, ldApplicable: true,
  ldAmountINR: null, ldAmountRegional: 5_000, ldCurrency: "OMR", ldRemarks: null, regionalCurrency: "OMR", workOrderValueRegional: 10_000, ...over,
});
const PDF_BASE = { manhourRows: [], nonManhourRows: [{ category: "Travel", description: "Trip", quantity: 1, unitCost: 1_000, totalCost: 1_000, remarks: null }], invoiceRows: [], fetchedAt: new Date("2026-11-17T05:00:00Z") };

test("PDF: a regional LD prints in the project's currency and is deducted (Profit After LD = Profit Before LD - LD); India still deducts rupees", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const oman = await pdfText(buildProjectFinancialPdf({ ...PDF_BASE, project: pdfProject({}) }, { timeZone: "Asia/Kolkata" }).bytes);
  assert.ok(oman.includes("OMR 5,000.000"), "the LD in OMR");
  assert.ok(oman.includes("Deducted from profit"));
  assert.ok(oman.includes("− OMR 5,000.000"), "the deduction line");
  assert.ok(oman.includes("OMR 9,000.000"), "Profit Before LD = 10,000 - 1,000");
  assert.ok(oman.includes("OMR 4,000.000"), "Profit After LD = 9,000 - 5,000");
  assert.ok(!oman.includes("₹"), "no rupee sign anywhere in an Oman PDF");
  assert.ok(!oman.includes("not deducted"), "no legacy wording");
  const india = await pdfText(
    buildProjectFinancialPdf({ ...PDF_BASE, project: pdfProject({ regionalCurrency: null, workOrderValueINR: 10_000, workOrderValueRegional: undefined, ldAmountINR: 5_000, ldAmountRegional: null, ldCurrency: "INR" }) }, { timeZone: "Asia/Kolkata" }).bytes
  );
  assert.ok(india.includes("Deducted from profit"), "India: LD is deducted as before");
  assert.ok(india.includes("− ₹ 5,000.00"));
  assert.ok(india.includes("₹ 4,000.00"), "India: Profit After LD = 9,000 - 5,000");
  assert.ok(!india.includes("₹ 5,000.00 (INR)") && !india.includes("not deducted"), "no non-India LD wording on an India PDF");
});

test("PDF: a legacy rupee LD on a non-India project is printed as INR, said not to be deducted, and the profit after LD equals the profit before", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const legacy = await pdfText(buildProjectFinancialPdf({ ...PDF_BASE, project: pdfProject({ ldAmountINR: 5_000, ldAmountRegional: null, ldCurrency: null }) }, { timeZone: "Asia/Kolkata" }).bytes);
  assert.ok(legacy.includes("₹ 5,000.00 (INR)"));
  assert.ok(legacy.includes("not deducted from OMR profit"));
  assert.ok(legacy.includes("Recorded in INR; not deducted"));
  assert.ok(!legacy.includes("OMR 5,000"), "the INR amount is never printed as OMR");
  assert.ok(!legacy.includes("OMR 4,000.000"), "Profit After LD is not 9,000 - 5,000");
});

// ── Excel export and Reports basis ───────────────────────────────────────

test("Excel (Projects sheet): India's INR columns are unchanged; a regional LD lands in the Project Currency columns with its currency named; a legacy rupee LD stays in the INR column", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const { buildExportWorkbook } = await load("/src/services/projectWorkbookService.ts");
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  const base = { ...createEmptyProject(), projectStatus: "Completed" };
  const oman = { ...base, id: "o", prNo: "EE-1", prCategory: "Oman", regionalCurrency: "OMR", workOrderValueINR: 0, workOrderValueRegional: 10_000, backendWorkOrderValueRegional: 10_000, backendNonManhourCostINR: 1_000, backendManhourCostINR: 0, resources: [], ldApplicable: true, ldAmountINR: null, ldAmountRegional: 5_000, ldCurrency: "OMR" };
  const legacy = { ...oman, id: "l", prNo: "EE-2", ldAmountINR: 5_000, ldAmountRegional: null, ldCurrency: null };
  const india = { ...base, id: "i", prNo: "PR-1", workOrderValueINR: 10_000, backendWorkOrderValueINR: 10_000, backendManhourCostINR: 0, backendNonManhourCostINR: 1_000, ldApplicable: true, ldAmountINR: 5_000, ldCurrency: "INR" };
  const wb = await buildExportWorkbook([india, oman, legacy]);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  const sheet = back.getWorksheet("Projects");
  const header = sheet.getRow(1).values.slice(1);
  const at = (r, name) => sheet.getRow(r).values[header.indexOf(name) + 1];
  // India (row 2): the original INR columns, then the same figures with the currency INR.
  assert.deepEqual(["LD Amount (INR)", "Profit Before LD (INR)", "Final Profit After LD (INR)"].map((h) => at(2, h)), [5_000, 9_000, 4_000]);
  assert.deepEqual(["LD Currency", "LD Amount (Project Currency)", "Profit Before LD (Project Currency)", "Final Profit After LD (Project Currency)"].map((h) => at(2, h)), ["INR", 5_000, 9_000, 4_000]);
  // Oman regional LD (row 3): the INR columns stay blank (nothing regional under an INR heading), the Project Currency columns carry OMR figures.
  assert.deepEqual(["LD Amount (INR)", "Profit Before LD (INR)", "Final Profit After LD (INR)"].map((h) => at(3, h)), [undefined, undefined, undefined]);
  assert.deepEqual(["LD Currency", "LD Amount (Project Currency)", "Profit Before LD (Project Currency)", "Final Profit After LD (Project Currency)"].map((h) => at(3, h)), ["OMR", 5_000, 9_000, 4_000]);
  // Legacy rupee LD on the same Oman project (row 4): the rupee amount stays in the INR column, is named INR, and the profit is not reduced.
  assert.equal(at(4, "LD Amount (INR)"), 5_000);
  assert.deepEqual(["LD Currency", "LD Amount (Project Currency)", "Profit Before LD (Project Currency)", "Final Profit After LD (Project Currency)"].map((h) => at(4, h)), ["INR", 5_000, 9_000, 9_000]);
});

test("Reports: a regional LD is carried in its country group's currency and deducted there; 'No LD' stays No; a legacy rupee LD is left out of the group", async () => {
  const { reportBasis } = await load("/src/components/reports/reportCurrency.ts");
  const oman = { regionalCurrency: "OMR", prCategory: "Oman", workOrderValueINR: 0, workOrderValueRegional: 10_000, resources: [] };
  const regional = reportBasis({ ...oman, ldApplicable: true, ldAmountINR: null, ldAmountRegional: 5_000, ldCurrency: "OMR" });
  assert.equal(regional.ldApplicable, true);
  assert.equal(regional.ldAmountINR, 5_000, "the amount in the group's own currency, under the field the report calculations read");
  const no = reportBasis({ ...oman, ldApplicable: false });
  assert.equal(no.ldApplicable, false);
  const legacy = reportBasis({ ...oman, ldApplicable: true, ldAmountINR: 5_000 });
  assert.equal(legacy.ldApplicable, null, "a legacy rupee amount is not added into an OMR group");
  assert.equal(legacy.ldAmountINR, null);
  const wrong = reportBasis({ ...oman, ldApplicable: true, ldAmountINR: null, ldAmountRegional: 5_000, ldCurrency: "AED" });
  assert.equal(wrong.ldApplicable, null);
  const india = { regionalCurrency: null, workOrderValueINR: 10_000, ldApplicable: true, ldAmountINR: 50_000 };
  assert.deepEqual(reportBasis(india), india, "an India project is returned untouched");
});

test("wiring: the completion popup, project views and save payload speak the project's own currency", () => {
  const modal = src("components/Projects/ProjectCompletionModal.tsx");
  assert.match(modal, /parseLdAmountInput\(ldAmountText, projectCurrency\)/);
  assert.match(modal, /ldAmountFields\(parsed\.value, projectCurrency\)/);
  assert.match(modal, /data-testid="ld-currency-note"/);
  assert.doesNotMatch(modal, /ld-inr-note/, "no 'enter INR' instruction any more");
  assert.match(modal, /Liquidated Damages \(\$\{projectCurrency\}\)/);
  const card = src("pages/Projects/components/GeneralInfoCard.tsx");
  assert.match(card, /projectCurrency=\{regionalCurrencyOf\(project\)\}/);
  assert.match(card, /isNonInrRegional\(project\) \? regionalWorkOrderValue\(project\)/);
  assert.match(card, /ldAmountText\(project\)/);
  assert.match(src("pages/Projects/components/GeneralView.tsx"), /ldAmountLabel\(project\)/);
  const service = src("services/projectService.ts");
  assert.match(service, /ldAmount: project\.ldAmountRegional, ldCurrency: project\.ldCurrency \?\? project\.regionalCurrency/, "a regional LD is re-sent in its own currency");
});
