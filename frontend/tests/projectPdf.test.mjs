// Project Financial Report PDF tests (Oct 2026).
// Run: npm test  (node:test + Vite's SSR module loader, same harness as
// dateInputValidation.test.mjs). PDF text is read back with pdfjs-dist,
// already an app dependency — no new test dependency.
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
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());

const TZ = "Asia/Kolkata";
const FETCHED_AT = new Date("2026-10-16T07:30:00Z"); // 16 Oct 2026, 01:00 pm IST

/** Text of every page, in order, via pdfjs-dist. */
async function pdfPages(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => it.str).join(" ").replace(/\s+/g, " "));
  }
  await task.destroy();
  return pages;
}

function sampleData(overrides = {}) {
  return {
    project: {
      id: "p1",
      prNo: "PR-12069/A",
      rfqNo: "RFQ-77",
      projectTitle: "Pipeline Integrity Study",
      client: "Acme Refineries",
      department: "Asset Integrity",
      domesticForeign: "Domestic",
      contractType: "LUMP SUM",
      projectStatus: "Active",
      workOrderStatus: "Received",
      workOrderNumber: "WO-2026-01",
      workOrderDate: "2026-03-02",
      projectStartDate: "2026-03-05",
      projectEndDate: null,
      actualCompletionDate: null,
      primaryProjectManager: "Priya Raman",
      secondaryProjectManager: null,
      pmoCoordinator: "Kumar S",
      workOrderValueINR: 1000000,
    },
    manhourRows: [
      { employeeNo: "E001", employeeName: "Arjun Mehta", nameFromDirectory: true, designation: "Lead Engineer", assignmentStatus: "Active", totalHours: 120, hourlyRate: 1500, manhourCost: 180000 },
      { employeeNo: "E999", employeeName: "E999", nameFromDirectory: false, designation: null, assignmentStatus: "Completed", totalHours: 40.5, hourlyRate: 1000, manhourCost: 40500 },
    ],
    nonManhourRows: [
      { category: "Travel", description: "Site visit", quantity: 2, unitCost: 12500, totalCost: 25000, remarks: null },
      { category: "Software", description: "Licence", quantity: 1, unitCost: 54500.5, totalCost: 54500.5, remarks: "Annual" },
    ],
    invoiceRows: [
      { invoiceNo: "INV-001", invoiceDate: "2026-05-01", status: "Paid", milestoneName: "Advance", itemDescription: "Engineering", invoiceAmountINR: 300000, currency: "INR", invoiceAmountOriginal: null },
      { invoiceNo: "INV-002", invoiceDate: "2026-06-01", status: "Raised", milestoneName: "Design", itemDescription: "Engineering", invoiceAmountINR: 200000, currency: "USD", invoiceAmountOriginal: 2400 },
      { invoiceNo: "INV-003", invoiceDate: "2026-07-01", status: "Draft", milestoneName: null, itemDescription: "Engineering", invoiceAmountINR: 50000, currency: "INR", invoiceAmountOriginal: null },
      { invoiceNo: "INV-004", invoiceDate: "2026-07-15", status: "Cancelled", milestoneName: null, itemDescription: "Engineering", invoiceAmountINR: 99999, currency: "INR", invoiceAmountOriginal: null },
    ],
    fetchedAt: FETCHED_AT,
    ...overrides,
  };
}

// ── Phase 1: financial definitions ───────────────────────────────────────

test("computeProjectFinancials: Draft counts as Raised, Cancelled excluded, Received = Paid capped at Raised", async () => {
  const { computeProjectFinancials } = await load("/src/utils/projectFinancials.ts");
  const f = computeProjectFinancials({
    workOrderValueINR: 1000000,
    manhourCosts: [180000, 40500],
    nonManhourRows: [{ quantity: 2, unitCost: 12500, totalCost: 25000 }, { quantity: 1, unitCost: 54500.5, totalCost: 54500.5 }],
    invoiceLines: [
      { status: "Paid", invoiceAmountINR: 300000 },
      { status: "Raised", invoiceAmountINR: 200000 },
      { status: "Draft", invoiceAmountINR: 50000 },
      { status: "PartiallyPaid", invoiceAmountINR: 10000 },
      { status: "Cancelled", invoiceAmountINR: 99999 },
    ],
  });
  assert.equal(f.invoice.raised, 560000, "Paid + Raised + Draft + PartiallyPaid; Cancelled excluded");
  assert.equal(f.invoice.received, 300000, "only Paid lines count as received");
  assert.equal(f.invoice.outstanding, 700000, "WO − Received");
  assert.equal(f.invoice.draftCount, 1);
  assert.equal(f.invoice.draftAmount, 50000);
  assert.equal(f.invoice.cancelledAmount, 99999);
  assert.deepEqual(f.invoice.byStatus.map((s) => s.status), ["Draft", "Raised", "PartiallyPaid", "Paid", "Cancelled"]);
  assert.equal(f.manhourTotal, 220500);
  assert.equal(f.nonManhourTotal, 79500.5);
  assert.equal(f.expenses, 300000.5);
  assert.equal(f.profit, 699999.5);
  assert.ok(Math.abs(f.profitPercent - 69.99995) < 1e-9);
});

test("computeProjectFinancials: edge cases (WO 0, no invoice access, Received cap, Outstanding floor)", async () => {
  const { computeProjectFinancials } = await load("/src/utils/projectFinancials.ts");
  const zero = computeProjectFinancials({ workOrderValueINR: 0, manhourCosts: [], nonManhourRows: [], invoiceLines: [] });
  assert.equal(zero.profitPercent, null, "WO 0 → Profit % is not a number to show");
  assert.equal(zero.invoice.raised, 0);

  const noAccess = computeProjectFinancials({ workOrderValueINR: 500, manhourCosts: [100], nonManhourRows: [], invoiceLines: null });
  assert.equal(noAccess.invoice, null, "no invoice access is null, never zeros");
  assert.equal(noAccess.profit, 400, "profit does not depend on invoices");

  // Paid cannot exceed Raised only via Cancelled-free data; guard the cap anyway with a negative adjustment line.
  const capped = computeProjectFinancials({ workOrderValueINR: 100, manhourCosts: [], nonManhourRows: [], invoiceLines: [{ status: "Paid", invoiceAmountINR: 150 }, { status: "Raised", invoiceAmountINR: -100 }] });
  assert.equal(capped.invoice.raised, 50);
  assert.equal(capped.invoice.received, 50, "Received capped at Raised");
  assert.equal(capped.invoice.outstanding, 50);

  const over = computeProjectFinancials({ workOrderValueINR: 100, manhourCosts: [NaN, 10], nonManhourRows: [], invoiceLines: [{ status: "Paid", invoiceAmountINR: 400 }] });
  assert.equal(over.invoice.outstanding, 0, "Outstanding never negative");
  assert.equal(over.manhourTotal, 10, "a non-numeric manhourCost counts as 0, as in Reports");
});

test("computeProjectFinancials matches the Reports registry formulas for the same inputs", async () => {
  const { computeProjectFinancials } = await load("/src/utils/projectFinancials.ts");
  const { getTotalNonManhourCost } = await load("/src/services/expenseService.ts");
  const nonManhour = [{ quantity: 3, unitCost: 10, totalCost: 30 }, { quantity: 2, unitCost: 5, totalCost: NaN }];
  const resources = [{ manhourCost: 1000 }, { manhourCost: 250.25 }];
  const wo = 5000;
  // ExecutiveSummaryTable / useReportsData per-project formulas, verbatim:
  const reportsExpenses = getTotalNonManhourCost(nonManhour) + resources.reduce((a, r) => a + (r.manhourCost || 0), 0);
  const reportsProfit = wo - reportsExpenses;
  const reportsPct = wo === 0 ? 0 : (reportsProfit / wo) * 100;

  const f = computeProjectFinancials({ workOrderValueINR: wo, manhourCosts: resources.map((r) => r.manhourCost), nonManhourRows: nonManhour, invoiceLines: [] });
  assert.equal(f.expenses, reportsExpenses);
  assert.equal(f.nonManhourTotal, 40, "NaN totalCost falls back to qty × unit cost, exactly like getTotalNonManhourCost");
  assert.equal(f.profit, reportsProfit);
  assert.equal(f.profitPercent, reportsPct);
});

// ── Phase 1: read-only data service ──────────────────────────────────────

function stubDeps(ApiError, responses, employees = []) {
  const calls = [];
  return {
    calls,
    deps: {
      get: async (path) => {
        calls.push(path);
        const r = responses[path];
        if (r instanceof Error) throw r;
        if (typeof r === "number") throw new ApiError(r, `HTTP ${r}`);
        return r;
      },
      getEmployees: () => employees,
      now: () => FETCHED_AT,
    },
  };
}

const RAW_PROJECT = {
  id: "p 1",
  prNo: " PR-1 ",
  rfqNo: "",
  projectTitle: "T",
  client: "C",
  department: "D",
  projectStatus: "Active",
  workOrderDate: "2026-03-02T00:00:00.000Z",
  projectStartDate: "2026-02-30T00:00:00.000Z",
  projectEndDate: null,
  workOrderValueINR: 1234.5,
};

function okResponses(base = "/projects/p%201") {
  return {
    [base]: RAW_PROJECT,
    [`${base}/expenses`]: { items: [{ category: "Travel", description: "Cab", quantity: 2, unitCost: 10, totalCost: 20, remarks: "" }], count: 1, latestUpdatedAt: null },
    [`${base}/resources`]: { items: [{ employeeNo: "e001", assignmentStatus: "Active", totalHours: 5, hourlyRateSnapshot: 100, manhourCost: 500 }, { employeeNo: "X9", totalHours: 1, hourlyRateSnapshot: 50, manhourCost: 50 }] },
    [`${base}/invoice-items`]: {
      items: [
        { description: "Item B", invoices: [{ invoiceNo: "INV-10", invoiceDate: "2026-06-01T00:00:00.000Z", status: "Draft", invoiceAmountINR: 5, currency: "INR", invoiceAmountOriginal: 5 }] },
        { description: "Item A", invoices: [{ invoiceNo: "INV-2", invoiceDate: "2026-05-01T00:00:00.000Z", status: "Paid", milestoneName: "M1", invoiceAmountINR: 7, currency: "USD", invoiceAmountOriginal: 0.08 }, { invoiceNo: "INV-9", invoiceDate: null, status: "Raised", invoiceAmountINR: 1 }] },
      ],
    },
  };
}

test("fetchProjectReportData: four GETs only, own mapping, cached employee names with employee-number fallback", async () => {
  const { fetchProjectReportData } = await load("/src/services/projectReportDataService.ts");
  const { ApiError } = await load("/src/services/apiClient.ts");
  const employees = [{ employeeNo: "E001", employeeName: "Arjun Mehta", designation: "Lead Engineer" }];
  const { calls, deps } = stubDeps(ApiError, okResponses(), employees);
  const data = await fetchProjectReportData("p 1", deps);

  assert.deepEqual(calls.sort(), ["/projects/p%201", "/projects/p%201/expenses", "/projects/p%201/invoice-items", "/projects/p%201/resources"]);
  assert.equal(data.project.prNo, "PR-1");
  assert.equal(data.project.rfqNo, null, "empty string → not recorded");
  assert.equal(data.project.workOrderDate, "2026-03-02");
  assert.equal(data.project.projectStartDate, null, "an impossible date is never shown");
  assert.equal(data.project.workOrderValueINR, 1234.5);
  assert.equal(data.fetchedAt, FETCHED_AT);

  assert.deepEqual(data.manhourRows.map((r) => [r.employeeName, r.nameFromDirectory, r.designation]), [
    ["Arjun Mehta", true, "Lead Engineer"],
    ["X9", false, null],
  ], "case-insensitive employee-number match; unknown → employee number");
  assert.equal(data.nonManhourRows[0].remarks, null);

  assert.deepEqual(data.invoiceRows.map((r) => r.invoiceNo), ["INV-2", "INV-10", "INV-9"], "chronological, undated last");
  assert.equal(data.invoiceRows[0].itemDescription, "Item A");
  assert.equal(data.invoiceRows[2].currency, "INR", "missing currency defaults to INR");
});

test("fetchProjectReportData: permission and failure handling", async () => {
  const { fetchProjectReportData, ProjectReportDataError, PROJECT_REPORT_ACCESS_MESSAGE, PROJECT_REPORT_RETRY_MESSAGE } = await load("/src/services/projectReportDataService.ts");
  const { ApiError } = await load("/src/services/apiClient.ts");
  const base = "/projects/p%201";
  const run = (patch) => fetchProjectReportData("p 1", stubDeps(ApiError, { ...okResponses(), ...patch }).deps);
  const expectKind = async (patch, kind, label) => {
    await assert.rejects(run(patch), (err) => {
      assert.ok(err instanceof ProjectReportDataError, label);
      assert.equal(err.kind, kind, label);
      assert.equal(err.message, kind === "access" ? PROJECT_REPORT_ACCESS_MESSAGE : PROJECT_REPORT_RETRY_MESSAGE);
      return true;
    });
  };

  await expectKind({ [base]: 403 }, "access", "403 on project");
  await expectKind({ [base]: 404 }, "access", "404 on project");
  await expectKind({ [`${base}/resources`]: 403 }, "access", "403 on resources");
  await expectKind({ [`${base}/expenses`]: 404 }, "access", "404 on expenses");
  await expectKind({ [`${base}/expenses`]: 500 }, "retry", "server error");
  await expectKind({ [base]: 0 }, "retry", "network error on project");
  await expectKind({ [`${base}/invoice-items`]: 0 }, "retry", "network error on invoices aborts — never a partial report");
  await expectKind({ [`${base}/invoice-items`]: 500 }, "retry", "server error on invoices");
  await expectKind({ [`${base}/resources`]: new TypeError("boom") }, "retry", "unexpected error");

  const noInvoices = await run({ [`${base}/invoice-items`]: 403 });
  assert.equal(noInvoices.invoiceRows, null, "403 on invoices only → report without invoice figures");
  assert.equal(noInvoices.manhourRows.length, 2);
});

// ── Phase 2: the PDF itself ──────────────────────────────────────────────

test("formatting helpers and filename", async () => {
  const m = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  assert.equal(m.formatReportINR(1234567.891), "₹ 12,34,567.89");
  assert.equal(m.formatReportINR(-0.001), "₹ 0.00", "never -0.00");
  assert.equal(m.formatReportINR(-2500), "₹ -2,500.00");
  assert.equal(m.formatReportDate("2026-10-16"), "16 Oct 2026");
  assert.equal(m.formatReportDate(null), "—");
  assert.equal(m.buildProjectPdfFilename("PR-12069/A", FETCHED_AT, TZ), "Project-Financial-Report-PR-12069-A-2026-10-16.pdf");
  assert.equal(m.buildProjectPdfFilename(" ../..\\x:y ", FETCHED_AT, TZ), "Project-Financial-Report-x-y-2026-10-16.pdf", "no path characters survive");
  assert.equal(m.buildProjectPdfFilename("", FETCHED_AT, TZ), "Project-Financial-Report-Project-2026-10-16.pdf");
  assert.equal(m.buildProjectPdfFilename("PR-1", new Date("2026-10-16T20:00:00Z"), TZ), "Project-Financial-Report-PR-1-2026-10-17.pdf", "local calendar date, not UTC");
});

test("PDF: valid file with every section, exact INR, Draft labelled, Cancelled excluded, page footer", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const built = buildProjectFinancialPdf(sampleData(), { timeZone: TZ });
  assert.equal(new TextDecoder().decode(built.bytes.slice(0, 5)), "%PDF-");
  assert.equal(built.blob.type, "application/pdf");
  assert.equal(built.filename, "Project-Financial-Report-PR-12069-A-2026-10-16.pdf");
  assert.ok(built.bytes.length < 400_000, `size ${built.bytes.length} bytes stays small (fonts are subset)`);

  const pages = await pdfPages(built.bytes);
  assert.equal(pages.length, built.pageCount);
  const all = pages.join("\n");
  for (const expected of [
    "Project Financial Report",
    "PR-12069/A",
    "Pipeline Integrity Study",
    "Acme Refineries",
    "RFQ-77",
    "02 Mar 2026",
    "Not recorded", // Secondary PM
    "Generated 16 Oct 2026",
    "Project Details",
    "Financial Summary",
    "Financial Overview",
    "Man-hour Expenses",
    "Non-man-hour Expenses",
    "Invoices",
    "₹ 10,00,000.00", // WO
    "₹ 5,50,000.00", // Raised = 3L + 2L + 50k Draft
    "incl. Drafts (₹ 50,000.00)",
    "₹ 3,00,000.00", // Received
    "₹ 7,00,000.00", // Outstanding
    "₹ 3,00,000.50", // Expenses = 2,20,500 + 79,500.50
    "₹ 6,99,999.50", // Profit
    "Profit % 70.0%",
    "Arjun Mehta",
    "Lead Engineer",
    "E999",
    "shown by employee number",
    "₹ 2,20,500.00",
    "₹ 79,500.50",
    "DRAFT",
    "Cancelled (excluded)",
    "USD 2,400.00",
    "Confidential — iFluids Engineering",
    `Page 1 of ${built.pageCount}`,
  ]) {
    assert.ok(all.includes(expected), `PDF text should contain "${expected}"`);
  }
  assert.equal(built.financials.invoice.raised, 550000);
  assert.equal(built.financials.expenses, 300000.5);
});

test("PDF: no invoice access says 'Not available', never ₹0 for invoice figures", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const built = buildProjectFinancialPdf(sampleData({ invoiceRows: null }), { timeZone: TZ });
  const all = (await pdfPages(built.bytes)).join("\n");
  assert.ok(all.includes("Not available (no invoice access)"));
  assert.ok(all.includes("No invoice access"));
  assert.ok(!all.includes("Totals by status"), "no invoice totals table");
  assert.ok(!all.includes("₹ 0.00"), "no zero amounts printed in place of unreadable invoice data");
  assert.equal(built.financials.invoice, null);
});

test("PDF: WO value 0 shows Profit % as —; empty sections say so", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const base = sampleData();
  const built = buildProjectFinancialPdf({ ...base, project: { ...base.project, workOrderValueINR: 0 }, manhourRows: [], nonManhourRows: [], invoiceRows: [] }, { timeZone: TZ });
  const all = (await pdfPages(built.bytes)).join("\n");
  assert.ok(all.includes("Profit % —"));
  assert.ok(all.includes("No man-hour resources recorded"));
  assert.ok(all.includes("No non-man-hour expenses recorded"));
  assert.ok(all.includes("No invoices raised for this project yet."));
});

test("PDF: long tables flow onto more pages with repeated headers and 'Page X of Y' on every page", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const manhourRows = Array.from({ length: 70 }, (_, i) => ({ employeeNo: `E${String(i).padStart(3, "0")}`, employeeName: `Engineer ${i}`, nameFromDirectory: true, designation: "Engineer", assignmentStatus: "Active", totalHours: 10, hourlyRate: 100, manhourCost: 1000 }));
  const invoiceRows = Array.from({ length: 50 }, (_, i) => ({ invoiceNo: `INV-${i}`, invoiceDate: "2026-05-01", status: "Raised", milestoneName: null, itemDescription: "Work", invoiceAmountINR: 100, currency: "INR", invoiceAmountOriginal: null }));
  const built = buildProjectFinancialPdf(sampleData({ manhourRows, invoiceRows }), { timeZone: TZ });
  assert.ok(built.pageCount >= 3, `expected several pages, got ${built.pageCount}`);
  const pages = await pdfPages(built.bytes);
  pages.forEach((text, i) => {
    assert.ok(text.includes(`Page ${i + 1} of ${pages.length}`), `footer on page ${i + 1}`);
    assert.ok(text.includes("Confidential — iFluids Engineering"), `confidential footer on page ${i + 1}`);
  });
  assert.ok(pages.slice(1).every((t) => t.includes("Project Financial Report · PR-12069/A")), "running header on continuation pages");
  const headerPages = pages.filter((t) => t.includes("Man-hour Cost"));
  assert.ok(headerPages.length >= 2, "man-hour table header repeats on the next page");
  assert.ok(pages.join("\n").includes("₹ 70,000.00"), "man-hour subtotal");
  assert.equal(built.financials.manhourTotal, 70000);
});

// ── Issue 2: text the embedded font cannot draw is never dropped silently ─

/** Positioned text items of every page (pdfjs), in PDF points; y grows upwards. */
async function pdfItems(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.filter((it) => it.str.trim() !== "").map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height })));
  }
  await task.destroy();
  return pages;
}

test("toPdfText: Latin, ₹ and punctuation kept; each run of Tamil/Hindi/Chinese/emoji becomes one visible marker", async () => {
  const { toPdfText, UNSUPPORTED_MARKER: M } = await load("/src/reports/projectPdf/pdfText.ts");
  assert.deepEqual(toPdfText("Café – “quotes” ±5 °C ₹ 1,000 € £ … ©"), { text: "Café – “quotes” ±5 °C ₹ 1,000 € £ … ©", replaced: false });
  assert.deepEqual(toPdfText("சென்னை Petroleum"), { text: `${M} Petroleum`, replaced: true }, "a whole Tamil word is one marker");
  assert.equal(toPdfText("हिन्दी विभाग").text, `${M} ${M}`, "Hindi words keep their spacing");
  assert.equal(toPdfText("WO-中文-1").text, `WO-${M}-1`);
  assert.equal(toPdfText("Ravi 😀 Kumar").text, `Ravi ${M} Kumar`);
  assert.equal(toPdfText("Team 👩‍💻 lead").text, `Team ${M} lead`, "an emoji ZWJ sequence is one marker");
  assert.equal(toPdfText("Ok ✓ done").text, `Ok ${M} done`, "symbols outside the font are marked too");
  assert.equal(toPdfText("Café").text, "Café", "decomposed accents are normalised (NFC) and kept");
  assert.equal(toPdfText("Line 1\nLine\t2").text, "Line 1\nLine 2");
});

test("every code point the PDF treats as supported is in both embedded fonts; Tamil/Hindi/Chinese/emoji are not (so pdfText must mark them)", async () => {
  const { PDF_SUPPORTED_RANGES } = await load("/src/reports/projectPdf/pdfText.ts");
  const { jsPDF } = await import("jspdf");
  const fs = await import("node:fs");
  const dir = new URL("../src/assets/fonts/", import.meta.url);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  for (const [file, style] of [["NotoSans-Regular-subset.ttf", "normal"], ["NotoSans-Bold-subset.ttf", "bold"]]) {
    doc.addFileToVFS(file, fs.readFileSync(new URL(file, dir)).toString("base64"));
    doc.addFont(file, "NotoSans", style);
  }
  let checked = 0;
  for (const style of ["normal", "bold"]) {
    doc.setFont("NotoSans", style);
    // The embedded font's own character map (code point → glyph id), as parsed by jsPDF.
    const codeMap = doc.getFont().metadata.cmap.unicode.codeMap;
    for (const [lo, hi] of PDF_SUPPORTED_RANGES) {
      for (let cp = lo; cp <= hi; cp++) {
        assert.ok(codeMap[cp] > 0, `${style} U+${cp.toString(16)} has no glyph`);
        checked++;
      }
    }
    for (const ch of "சென்னைहिन्दी中文😀✓") assert.ok(!(codeMap[ch.codePointAt(0)] > 0), `${style}: ${ch} must not be in the font`);
  }
  assert.equal(checked, 790, "395 glyphs × 2 fonts");
});

test("PDF: multilingual names, titles and descriptions show the marker and an explanatory note — nothing disappears", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const base = sampleData();
  const built = buildProjectFinancialPdf(
    {
      ...base,
      project: { ...base.project, projectTitle: "Pipeline study சென்னை 中文 😀", client: "சென்னை பெட்ரோலியம் (Tamil client)", department: "विभाग Hindi" },
      manhourRows: [{ ...base.manhourRows[0], employeeName: "முருகன் Murugan" }, { ...base.manhourRows[1], employeeName: "முருகன்" }],
      nonManhourRows: [{ ...base.nonManhourRows[0], description: "Site visit ✓ 👩‍💻" }],
    },
    { timeZone: TZ }
  );
  assert.equal(built.textReplaced, true);
  const all = (await pdfPages(built.bytes)).join("\n");
  assert.ok(all.includes("Pipeline study � � �"), "title keeps its Latin part and marks each foreign run");
  assert.ok(all.includes("� (Tamil client)"));
  assert.ok(all.includes("� Murugan"));
  assert.ok(all.includes("Site visit � �"));
  assert.ok(all.includes("cannot display"), "explanatory note present");
  assert.ok(!/[஀-௿ऀ-ॿ一-鿿]/.test(all), "no undrawable script text is passed to jsPDF");

  const plain = buildProjectFinancialPdf(sampleData(), { timeZone: TZ });
  assert.equal(plain.textReplaced, false);
  assert.ok(!(await pdfPages(plain.bytes)).join("\n").includes("cannot display"), "no note for plain English data");
});

// ── Issue 3: long titles never overlap the running header or tables ──────

test("PDF: titles of ~100/300/500 chars and long unbroken tokens stay inside margins and never overlap page 2+ content", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const PAGE_W = 595.28;
  const MARGIN = 15 * 2.83465;
  const words = (n) => "Remaining life assessment and integrity study ".repeat(20).slice(0, n).trim();
  const titles = {
    "100 chars": words(100),
    "300 chars": words(300),
    "500 chars": words(500),
    "unbroken 300": "X".repeat(300),
    mixed: `${"A".repeat(180)} short ${"B".repeat(160)}`,
  };
  const manhourRows = Array.from({ length: 70 }, (_, i) => ({ employeeNo: `E${i}`, employeeName: `Engineer ${i}`, nameFromDirectory: true, designation: "Engineer", assignmentStatus: "Active", totalHours: 10, hourlyRate: 100, manhourCost: 1000 }));
  for (const [label, projectTitle] of Object.entries(titles)) {
    const base = sampleData();
    const built = buildProjectFinancialPdf({ ...base, project: { ...base.project, projectTitle }, manhourRows }, { timeZone: TZ });
    assert.ok(built.pageCount >= 3, `${label}: multi-page`);
    assert.equal(built.financials.manhourTotal, 70000, `${label}: totals unchanged`);
    const pages = await pdfItems(built.bytes);
    pages.forEach((items, i) => {
      for (const it of items) assert.ok(it.x >= MARGIN - 1 && it.x + it.w <= PAGE_W - MARGIN + 1, `${label} p${i + 1}: "${it.str.slice(0, 30)}" outside margins`);
      assert.ok(items.some((it) => it.str.includes(`Page ${i + 1} of ${pages.length}`)), `${label}: page number on p${i + 1}`);
    });
    const p1 = pages[0].map((it) => it.str).join("").replace(/\s+/g, "");
    assert.ok(p1.includes(projectTitle.replace(/\s+/g, "")), `${label}: full title on page 1`);
    for (const [i, items] of pages.entries()) {
      if (i === 0) continue;
      const header = items.filter((it) => it.y > 780);
      const body = items.filter((it) => it.y <= 780 && it.y > 60);
      const headerLines = new Set(header.map((it) => Math.round(it.y)));
      assert.ok(header.length > 0 && headerLines.size <= 2, `${label} p${i + 1}: running header uses at most two lines (got ${headerLines.size})`);
      assert.ok(header[0].str.startsWith("Project Financial Report"), `${label} p${i + 1}: running header text`);
      const headerBottom = Math.min(...header.map((it) => it.y));
      const bodyTop = Math.max(...body.map((it) => it.y + it.h));
      assert.ok(bodyTop < headerBottom - 4, `${label} p${i + 1}: content (top ${bodyTop.toFixed(1)}) clears the header (bottom ${headerBottom.toFixed(1)})`);
    }
    if (label !== "100 chars") assert.ok(pages[1].some((it) => it.y > 780 && it.str.endsWith("…")), `${label}: long running header is ellipsised`);
  }
});
