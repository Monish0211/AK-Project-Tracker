// Liquidated Damages (LD) tests (Oct 2026).
// Run: npm test  (node:test + Vite's SSR module loader, same harness as the
// other frontend tests). No network, no browser cache.
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
    // Same inert notification stub as reportsLiveData.test.mjs (projectService
    // is reached through the workbook service's imports).
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

const TZ = "Asia/Kolkata";

// ── Amount parsing and labels ────────────────────────────────────────────

test("parseLdAmountInput: > 0, at most 2 decimals, finite, upper bound; Indian grouping accepted", async () => {
  const { parseLdAmountInput, LD_MAX_INR } = await load("/src/utils/liquidatedDamages.ts");
  assert.deepEqual(parseLdAmountInput("50000"), { value: 50000, error: null });
  assert.deepEqual(parseLdAmountInput("1,25,000.50"), { value: 125000.5, error: null });
  assert.deepEqual(parseLdAmountInput(" 0.01 "), { value: 0.01, error: null });
  assert.deepEqual(parseLdAmountInput(String(LD_MAX_INR)), { value: LD_MAX_INR, error: null });
  for (const [input, message] of [
    ["", "Enter the LD Amount."],
    ["0", "LD Amount must be greater than zero."],
    ["0.00", "LD Amount must be greater than zero."],
    ["-5", "LD Amount must be greater than zero."],
    ["10.123", "LD Amount can have at most two decimal places."],
    ["1e5", "LD Amount must be a valid number."],
    ["abc", "LD Amount must be a valid number."],
    ["Infinity", "LD Amount must be a valid number."],
    ["100000000000", "LD Amount is too large."],
  ]) {
    const r = parseLdAmountInput(input);
    assert.equal(r.value, null, input);
    assert.equal(r.error, message, input);
  }
});

test("ldStatusLabel / isLdRecorded: null and undefined are Not recorded, never No", async () => {
  const { ldStatusLabel, isLdRecorded } = await load("/src/utils/liquidatedDamages.ts");
  assert.equal(ldStatusLabel(true), "Yes");
  assert.equal(ldStatusLabel(false), "No");
  assert.equal(ldStatusLabel(null), "Not recorded");
  assert.equal(ldStatusLabel(undefined), "Not recorded");
  assert.equal(isLdRecorded(false), true);
  assert.equal(isLdRecorded(null), false);
});

// ── Calculations ─────────────────────────────────────────────────────────

const BASE_INPUT = {
  workOrderValueINR: 1000000,
  manhourCosts: [180000, 40500],
  nonManhourRows: [{ quantity: 1, unitCost: 79500.5, totalCost: 79500.5 }],
  invoiceLines: [
    { status: "Paid", invoiceAmountINR: 300000 },
    { status: "Raised", invoiceAmountINR: 200000 },
  ],
};

test("computeProjectFinancials: LD adds new fields only — profit, profitPercent and invoice figures are unchanged", async () => {
  const { computeProjectFinancials } = await load("/src/utils/projectFinancials.ts");
  const none = computeProjectFinancials(BASE_INPUT);
  const yes = computeProjectFinancials({ ...BASE_INPUT, ld: { ldApplicable: true, ldAmountINR: 50000 } });
  const no = computeProjectFinancials({ ...BASE_INPUT, ld: { ldApplicable: false, ldAmountINR: null } });

  for (const f of [none, yes, no]) {
    assert.equal(f.expenses, 300000.5);
    assert.equal(f.profit, 699999.5, "Profit (before LD) never changes");
    assert.equal(f.profitBeforeLd, 699999.5);
    assert.equal(f.profitPercent.toFixed(4), "69.9999");
    assert.deepEqual(f.invoice, none.invoice, "LD never touches invoices or collections");
  }
  assert.equal(none.ldStatus, "Not recorded");
  assert.equal(none.ldDeduction, null);
  assert.equal(none.finalProfit, 699999.5);

  assert.equal(yes.ldStatus, "Yes");
  assert.equal(yes.ldDeduction, 50000);
  assert.equal(yes.finalProfit, 649999.5);
  assert.equal(yes.finalProfitPercent.toFixed(4), "64.9999");

  assert.equal(no.ldStatus, "No");
  assert.equal(no.ldDeduction, 0);
  assert.equal(no.finalProfit, 699999.5);
});

test("computeLdBreakdown: LD may exceed profit (negative final profit); WO 0 → null final %", async () => {
  const { computeLdBreakdown } = await load("/src/utils/projectFinancials.ts");
  const over = computeLdBreakdown({ workOrderValueINR: 100000, expensesINR: 90000, ldApplicable: true, ldAmountINR: 25000 });
  assert.equal(over.profitBeforeLd, 10000);
  assert.equal(over.finalProfit, -15000);
  assert.equal(over.finalProfitPercent, -15);
  const zero = computeLdBreakdown({ workOrderValueINR: 0, expensesINR: 500, ldApplicable: true, ldAmountINR: 100 });
  assert.equal(zero.finalProfit, -600);
  assert.equal(zero.finalProfitPercent, null);
});

test("projectLdSummary: uses the server expense totals when present, never the stale cache", async () => {
  const { projectLdSummary } = await load("/src/utils/projectFinancials.ts");
  const p = {
    workOrderValueINR: 900000, // stale cached quantity
    backendWorkOrderValueINR: 1000000,
    backendManhourCostINR: 220500,
    backendNonManhourCostINR: 79500.5,
    resources: [{ manhourCost: 1 }], // stale
    nonManhourExpenses: [{ quantity: 1, unitCost: 2, totalCost: 2 }], // stale
    ldApplicable: true,
    ldAmountINR: 50000,
  };
  const s = projectLdSummary(p);
  assert.equal(s.profitBeforeLd, 699999.5);
  assert.equal(s.finalProfit, 649999.5);
  // A backend without the totals falls back to the loaded rows.
  const legacy = projectLdSummary({ workOrderValueINR: 1000, resources: [{ manhourCost: 100 }], nonManhourExpenses: [{ quantity: 1, unitCost: 50, totalCost: 50 }], ldApplicable: null });
  assert.equal(legacy.profitBeforeLd, 850);
  assert.equal(legacy.ldStatus, "Not recorded");
});

// ── Reports registry (table + CSV/Excel) ─────────────────────────────────

function registryProject(overrides = {}) {
  return {
    id: "p1",
    prNo: "PR-LD-1",
    client: "LD Client",
    projectTitle: "LD project",
    department: "Training",
    projectStatus: "Completed",
    workOrderValueINR: 1000000,
    resources: [{ manhourCost: 220500 }],
    nonManhourExpenses: [{ quantity: 1, unitCost: 79500.5, totalCost: 79500.5 }],
    invoiceItems: [],
    ...overrides,
  };
}

test("registry row: LD columns appended after the unchanged ones; not recorded exports as blank cells", async () => {
  const XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
  const { sanitizeExportRows } = await load("/src/utils/sanitizeExportCell.ts");
  const { buildRegistryRow } = await load("/src/utils/reportRegistryRows.ts");
  const yes = buildRegistryRow(registryProject({ ldApplicable: true, ldAmountINR: 50000 }), true);
  const no = buildRegistryRow(registryProject({ ldApplicable: false, ldAmountINR: null }), true);
  const legacy = buildRegistryRow(registryProject(), true);

  assert.equal(yes.profit, 699999.5, "Profit column is still Profit Before LD");
  assert.deepEqual([yes.ldStatus, yes.ldAmount, yes.finalProfit], ["Yes", 50000, 649999.5]);
  assert.deepEqual([no.ldStatus, no.ldAmount, no.finalProfit], ["No", 0, 699999.5]);
  assert.deepEqual([legacy.ldStatus, legacy.ldAmount, legacy.finalProfit], [null, null, 699999.5]);

  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(sanitizeExportRows([yes, no, legacy]))).split("\n");
  assert.equal(
    csv[0],
    "id,prNo,client,projectTitle,department,status,woValue,raised,received,outstanding,expenses,profit,profitPct,ldStatus,ldAmount,finalProfit,finalProfitPct"
  );
  assert.ok(csv[1].endsWith(",Yes,50000,649999.5,64.99995"), csv[1]);
  assert.ok(csv[2].endsWith(",No,0,699999.5,69.99995"), csv[2]);
  assert.ok(csv[3].endsWith(",,,699999.5,69.99995"), `not recorded → blank LD cells: ${csv[3]}`);
});

// ── Completion popup (static render; interaction is covered in browser QA) ─

test("completion popup: LD section defaults to No; an LD recorded earlier is shown read-only", async () => {
  // Node's own React (the SSR-loaded modal externalizes react to the same copy).
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProjectCompletionModal } = await load("/src/components/Projects/ProjectCompletionModal.tsx");
  const props = { isOpen: true, projectTitle: "LD project", prNo: "PR-LD-1", onConfirm() {}, onCancel() {} };

  const fresh = renderToStaticMarkup(React.createElement(ProjectCompletionModal, props));
  assert.ok(fresh.includes("Liquidated Damages"), "LD section present");
  assert.match(fresh, /name="ldApplicable" checked="" value="no"/, "No is selected by default");
  assert.doesNotMatch(fresh, /checked="" value="yes"/);
  assert.ok(!fresh.includes("LD Amount"), "no amount field until Yes is chosen");
  assert.ok(fresh.includes("Mark Completed (No LD)"));

  const recorded = renderToStaticMarkup(
    React.createElement(ProjectCompletionModal, { ...props, recordedLd: { ldApplicable: true, ldAmountINR: 50000 } })
  );
  assert.ok(recorded.includes("Mark Project Completed"));
  assert.ok(!recorded.includes('name="ldApplicable"'), "no LD inputs once recorded");
  assert.ok(recorded.includes("50,000"), "recorded amount shown");
});

// ── Project Financial Report PDF ─────────────────────────────────────────

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

function pdfData(ld) {
  return {
    project: {
      id: "p1",
      prNo: "PR-LD-1",
      rfqNo: null,
      projectTitle: "LD project",
      client: "LD Client",
      department: "Training",
      domesticForeign: "Domestic",
      contractType: "LUMP SUM",
      projectStatus: "Completed",
      workOrderStatus: "Received",
      workOrderNumber: null,
      workOrderDate: null,
      projectStartDate: null,
      projectEndDate: null,
      actualCompletionDate: "2026-10-16",
      primaryProjectManager: null,
      secondaryProjectManager: null,
      pmoCoordinator: null,
      workOrderValueINR: 1000000,
      ldApplicable: null,
      ldAmountINR: null,
      ldRemarks: null,
      ...ld,
    },
    manhourRows: [{ employeeNo: "E1", employeeName: "A", nameFromDirectory: true, designation: null, assignmentStatus: "Active", totalHours: 1, hourlyRate: 220500, manhourCost: 220500 }],
    nonManhourRows: [{ category: "Travel", description: "Trip", quantity: 1, unitCost: 79500.5, totalCost: 79500.5, remarks: null }],
    invoiceRows: [],
    fetchedAt: new Date("2026-10-17T05:00:00Z"),
  };
}

test("PDF: LD Yes — LD Applicable row, Profit Before LD tile, breakdown to Final Profit After LD", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const built = buildProjectFinancialPdf(pdfData({ ldApplicable: true, ldAmountINR: 50000, ldRemarks: "LD-REF-77" }), { timeZone: TZ });
  const all = await pdfText(built.bytes);
  for (const expected of [
    "LD Applicable Yes",
    "LD Amount ₹ 50,000.00",
    "LD-REF-77",
    "PROFIT BEFORE LD",
    "LD DEDUCTION ₹ 50,000.00 Deducted from profit",
    "PROFIT AFTER LD ₹ 6,49,999.50 Profit % 65.0%",
    "Profit Before LD ₹ 6,99,999.50",
    "LD Deduction − ₹ 50,000.00",
    "Final Profit After LD (65.0%) ₹ 6,49,999.50",
  ]) {
    assert.ok(all.includes(expected), `PDF text should contain "${expected}"`);
  }
  assert.equal(built.financials.profit, 699999.5, "profit unchanged");
  assert.equal(built.financials.finalProfit, 649999.5);
});

test("PDF: LD No → 'Not applicable ₹ 0.00'; not recorded → 'LD not recorded'; LD above profit → negative final", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const no = await pdfText(buildProjectFinancialPdf(pdfData({ ldApplicable: false }), { timeZone: TZ }).bytes);
  assert.ok(no.includes("LD Applicable No"));
  assert.ok(no.includes("LD DEDUCTION ₹ 0.00 LD not applicable"), "LD No tile");
  assert.ok(no.includes("LD Deduction Not applicable ₹ 0.00"));
  assert.ok(no.includes("Final Profit After LD (70.0%) ₹ 6,99,999.50"));

  const legacy = await pdfText(buildProjectFinancialPdf(pdfData({}), { timeZone: TZ }).bytes);
  assert.ok(legacy.includes("LD Applicable Not recorded"));
  assert.ok(legacy.includes("LD DEDUCTION Not recorded LD not recorded"), "not-recorded tile never shows ₹ 0");
  assert.ok(legacy.includes("PROFIT AFTER LD ₹ 6,99,999.50 Profit % 70.0% · LD not recorded"), "after-LD tile flags not recorded");
  assert.ok(legacy.includes("LD Amount Not recorded"));
  assert.ok(legacy.includes("LD Deduction LD not recorded"));

  const over = await pdfText(buildProjectFinancialPdf(pdfData({ ldApplicable: true, ldAmountINR: 800000 }), { timeZone: TZ }).bytes);
  assert.ok(over.includes("Final Profit After LD (-10.0%) ₹ -1,00,000.50"), "negative final profit is printed, not capped");
});

test("PDF data mapping: LD fields from GET /projects/:id; anything else is Not recorded", async () => {
  const { fetchProjectReportData } = await load("/src/services/projectReportDataService.ts");
  const run = async (raw) =>
    (
      await fetchProjectReportData("p1", {
        get: async (path) => {
          if (path === "/projects/p1") return { id: "p1", prNo: "PR-LD-1", workOrderValueINR: 10, ...raw };
          return { items: [] };
        },
        getEmployees: () => [],
        now: () => new Date(),
      })
    ).project;
  const yes = await run({ ldApplicable: true, ldAmountINR: 12.5, ldRemarks: " ref " });
  assert.deepEqual([yes.ldApplicable, yes.ldAmountINR, yes.ldRemarks], [true, 12.5, "ref"]);
  const legacy = await run({});
  assert.deepEqual([legacy.ldApplicable, legacy.ldAmountINR, legacy.ldRemarks], [null, null, null]);
  const odd = await run({ ldApplicable: "yes", ldAmountINR: "12" });
  assert.deepEqual([odd.ldApplicable, odd.ldAmountINR], [null, null], "never coerces unexpected types");
});

// ── Projects Excel export ────────────────────────────────────────────────

test("Projects Excel export: LD columns appended last; blank for non-Completed and for not-recorded amounts", async () => {
  const ExcelJS = (await import("exceljs")).default;
  // The workbook's lookup lists read the employee/PMO caches from
  // localStorage; an empty in-memory stand-in is enough here.
  if (typeof globalThis.localStorage === "undefined") {
    const mem = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      clear: () => mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
  }
  const { buildExportWorkbook } = await load("/src/services/projectWorkbookService.ts");
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  const mk = (o) => ({
    ...createEmptyProject(),
    workOrderValueINR: 1000000,
    backendWorkOrderValueINR: 1000000,
    backendManhourCostINR: 220500,
    backendNonManhourCostINR: 79500.5,
    ...o,
  });
  const wb = await buildExportWorkbook([
    mk({ id: "a", prNo: "PR-A", projectStatus: "Completed", ldApplicable: true, ldAmountINR: 50000 }),
    mk({ id: "b", prNo: "PR-B", projectStatus: "Completed", ldApplicable: null }),
    mk({ id: "c", prNo: "PR-C", projectStatus: "Active" }),
  ]);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  const sheet = back.getWorksheet("Projects");
  const header = sheet.getRow(1).values.slice(1);
  assert.deepEqual(header.slice(-5), ["Remarks", "LD Status", "LD Amount (INR)", "Profit Before LD (INR)", "Final Profit After LD (INR)"]);
  // row.values is sparse and 1-based; Array.from turns holes into undefined.
  const last4 = (r) => Array.from({ length: 4 }, (_, i) => sheet.getRow(r).values[header.length - 3 + i]);
  assert.deepEqual(last4(2), ["Yes", 50000, 699999.5, 649999.5]);
  assert.deepEqual(last4(3), ["Not recorded", undefined, 699999.5, 699999.5]);
  assert.deepEqual(last4(4), [undefined, undefined, undefined, undefined]);
});
