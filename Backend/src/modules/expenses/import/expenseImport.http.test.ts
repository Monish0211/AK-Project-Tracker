import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import * as XLSX from "xlsx";
import app from "../../../app.js";
import { hashPassword } from "../../../shared/utils/password.util.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../../shared/utils/jwt.util.js";
import { parseExpenseWorkbook } from "./expenseImportParser.js";

/**
 * Other Project Expenses — Excel Import. End-to-end over real HTTP, real
 * Postgres, real JWTs, real in-memory xlsx buffers (built here, not read
 * from a fixture file, so the test never depends on a file outside the
 * repo). Sheet data below reproduces the EXACT verified structure/values of
 * the audited "PR 12 series.xlsx" workbook, with PR identifiers/prNo values
 * replaced by a TAG-suffixed variant to keep tests isolated from any real
 * local data (including a real "PR-12005" project already known to exist in
 * this local dev DB from prior manual testing).
 */

const TAG = String(Date.now());
const PR_A = `${TAG}5`; // "PR 12005"-equivalent
const PR_B = `${TAG}6`; // "PR 12006"-equivalent
const PR_C = `${TAG}2`; // "PR 12032"-equivalent

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function tokenFor(user: { id: string; email: string; roleId: string; roleName: string }): string {
  return signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName: user.roleName });
}

function projectPayload(prNo: string, title: string) {
  return {
    poMonth: "January 2026",
    prCategory: "India",
    prNo,
    client: "Expense Import Test Client",
    department: "PMO",
    domesticForeign: "Domestic",
    projectTitle: title,
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectStatus: "Not Started",
    workOrderNumber: `WO-${prNo}`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "Test EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "Test Coordinator",
  };
}

const LETTERHEAD_ROWS: unknown[][] = [
  ["IFluids Engineering"],
  ["VP BUSINESS CENTRE"],
  ["Cost Centre Account"],
  ["1-Jul-26 to 31-Aug-26"],
];
const HEADER_ROW = ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"];
const SUMMARY_ROWS: unknown[][] = [
  ["Opening Balance :", "", "", "", "", ""],
  ["Current Total :", "", "", "", "", ""],
  ["Closing Balance :", "", "", "", "", ""],
];

function sheetAoa(rows: unknown[][]): unknown[][] {
  return [...LETTERHEAD_ROWS, HEADER_ROW, ...rows, ...SUMMARY_ROWS];
}

function txRow(date: string, particulars: string, vchNo: string, debit: unknown, credit: unknown): unknown[] {
  return [date, particulars, "Journal", vchNo, debit, credit];
}

/** PR A rows (real "PR 12005" data) — Debit-only importable total = 76,048.70; two Credit-only rows correctly excluded. */
function prARows(): unknown[][] {
  return [
    txRow("2026-07-14", "Domestic - Travel Expenses", "1717", 2661, ""),
    txRow("2026-07-14", "Domestic - Travel Expenses", "1718", 2661, ""),
    txRow("2026-07-14", "Domestic - Travel Expenses", "2104", 1836.3, ""),
    txRow("2026-07-14", "Domestic - Travel Expenses", "2105", 1165.4, ""),
    txRow("2026-07-16", "Domestic - Travel Expenses", "1642", 5000, ""),
    txRow("2026-07-20", "Domestic - Travel Expenses", "1753", 8000, ""),
    txRow("2026-07-21", "Domestic - Travel Expenses", "1772", 4966, ""),
    txRow("2026-07-22", "Domestic - Travel Expenses", "2659", "", 1141.3),
    txRow("2026-07-28", "Domestic - Travel Expenses", "219", 9179, ""),
    txRow("2026-07-31", "Domestic - Travel Expenses", "2155", 580, ""),
    txRow("2026-08-05", "Consultancy Expenses-Domestic", "1956", 40000, ""),
    txRow("2026-08-17", "Domestic - Travel Expenses", "2703", "", 1484.7),
    txRow("2026-08-23", "Consultancy Fees", "110/26-27", "", 132000),
  ];
}

/** PR B rows (real "PR 12006" data) — Insurance rows (₹2,897) map to "Staff Welfare - Insurance" (approved 2026-09-29), so importable total = the full 183,724.00 audited Debit-only total. */
function prBRows(): unknown[][] {
  return [
    txRow("2026-06-01", "Domestic - Travel Expenses", "916", 130368, ""),
    txRow("2026-06-02", "Insurance", "1193", 1992, ""),
    txRow("2026-06-02", "Insurance", "1194", 905, ""),
    txRow("2026-06-30", "Foreign - Travel Expenses", "156", 49879, ""),
    txRow("2026-07-15", "Consultancy Fees - Foreign", "1572", "", 543188),
    txRow("2026-07-31", "Domestic - Travel Expenses", "2155", 580, ""),
  ];
}

/** PR C rows (real "PR 12032" data) — importable total = 40,149.45. */
function prCRows(): unknown[][] {
  return [
    txRow("2026-07-15", "Domestic - Travel Expenses", "2107", 1010.4, ""),
    txRow("2026-07-15", "Domestic - Travel Expenses", "2108", 1505.4, ""),
    txRow("2026-07-16", "Domestic - Travel Expenses", "2136", 3867.41, ""),
    txRow("2026-07-19", "Domestic - Travel Expenses", "1800", 1891, ""),
    txRow("2026-07-22", "Domestic - Travel Expenses", "2657", 2320.24, ""),
    txRow("2026-07-31", "Domestic - Travel Expenses", "2155", 17686, ""),
    txRow("2026-09-09", "Domestic - Travel Expenses", "2575", 11869, ""),
  ];
}

function buildWorkbook(sheets: { name: string; rows: unknown[][] }[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheetAoa(sheet.rows));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return out;
}

function xlsxFile(buffer: Buffer, name = "import.xlsx"): File {
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
}

interface SheetResultDto {
  sheetName: string;
  rawPrIdentifier: string;
  matchedProjectId: string | null;
  matchedPrNo: string | null;
  unmatchedReason?: string;
  rowsImportable: { particulars: string; amount: number; anomaly: boolean; category: string }[];
  rowsSkippedCreditOnly: { particulars: string; creditAmount: number }[];
  rowsPendingCategoryDecision: { particulars: string; amount: number }[];
  computedDebitOnlyTotal: number;
  existingManualExpenses: { id: string; category: string; description: string; totalCost: number }[];
  changeStatus: string;
  previousActiveImportedTotal?: number;
}

interface ImportResultDto {
  batchId: string | null;
  status: string;
  rejectedDuplicateOfBatchId?: string;
  totalRowsImported: number;
  totalRowsSkipped: number;
  sheets: SheetResultDto[];
}

// ---------------------------------------------------------------------------
// Pure parser unit tests — no server, no DB. Every Debit/Credit case (A-E)
// plus summary-row exclusion, exercised directly against parseExpenseWorkbook().
// ---------------------------------------------------------------------------

test("parseExpenseWorkbook — Debit/Credit classification cases A-E, and summary rows are excluded", () => {
  const rows: unknown[][] = [
    txRow("2026-01-01", "Case A", "1", 100, ""), // A: Debit>0, Credit blank -> import
    txRow("2026-01-01", "Case B", "2", "", 200), // B: Debit blank, Credit numeric -> skip, never a fallback
    txRow("2026-01-01", "Case B zero", "3", 0, 200), // B variant: Debit = 0 (not "blank") + Credit numeric -> still skip
    txRow("2026-01-01", "Case C", "4", 300, 50), // C: both numeric -> import Debit only, flagged anomaly
    txRow("2026-01-01", "Case D", "5", "", ""), // D: both blank -> skip, no amount
    txRow("2026-01-01", "Case E", "6", "not a number", ""), // E: non-numeric Debit -> skip, data-quality warning
  ];
  const buffer = buildWorkbook([{ name: "PR TESTCASE", rows }]);
  const parsed = parseExpenseWorkbook(buffer);

  assert.equal(parsed.sheets.length, 1);
  const sheet = parsed.sheets[0]!;
  // 6 real transaction rows + 3 summary rows (blank Particulars) correctly excluded.
  assert.equal(sheet.rows.length, 6);

  const byParticulars = new Map(sheet.rows.map((r) => [r.particulars, r]));

  const caseA = byParticulars.get("Case A")!;
  assert.equal(caseA.outcome, "import");
  assert.equal((caseA as { amount: number }).amount, 100);
  assert.equal((caseA as { anomaly: boolean }).anomaly, false);

  assert.equal(byParticulars.get("Case B")!.outcome, "skippedCreditOnly");
  assert.equal(byParticulars.get("Case B zero")!.outcome, "skippedCreditOnly");

  const caseC = byParticulars.get("Case C")!;
  assert.equal(caseC.outcome, "import");
  assert.equal((caseC as { amount: number }).amount, 300); // Debit only, Credit ignored
  assert.equal((caseC as { anomaly: boolean }).anomaly, true);

  assert.equal(byParticulars.get("Case D")!.outcome, "skippedNoAmount");
  assert.equal(byParticulars.get("Case E")!.outcome, "skippedNonNumericDebit");
});

/**
 * P0 regression (Sept 2026 QA Finding 1) — a workbook whose columns are
 * reordered can put a summary row's own label (e.g. "Current Total :")
 * directly into whatever column is mapped as "Particulars", which the old
 * blank-Particulars-only rule failed to exclude, causing a real corrupted
 * ProjectExpense to be persisted equal to the ledger's own subtotal. Fixed
 * by isAccountingSummaryLabel() in expenseImportParser.ts. Builds raw sheets
 * directly (not via the sheetAoa()/HEADER_ROW helpers above, which assume
 * the one fixed column order) so each test controls its own header/column
 * layout exactly as described in the fix's acceptance tests A-E.
 */
function buildRawSheetWorkbook(sheetName: string, aoa: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("expenseImportParser — Finding 1 regression: summary rows excluded regardless of column order", () => {
  const letterhead = [["IFluids Engineering"], ["Cost Centre Account"]];

  // ---- Test A: original column order (Date | Particulars | Vch Type | Vch No. | Debit | Credit) ----
  const sheetA = [
    ...letterhead,
    ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"],
    ["2026-09-01", "Travel Expenses", "Payment", "101", 5000, ""],
    ["2026-09-02", "Printing", "Payment", "102", 6000, ""],
    ["", "Current Total :", "", "", 11000, ""],
  ];
  const parsedA = parseExpenseWorkbook(buildRawSheetWorkbook("PR TESTA", sheetA));
  const rowsA = parsedA.sheets[0]!.rows;
  assert.equal(rowsA.length, 2, "Test A: only the 2 real rows, summary row excluded");
  assert.ok(rowsA.every((r) => r.particulars !== "Current Total :"));
  const totalA = rowsA.reduce((s, r) => s + (r.outcome === "import" ? r.amount : 0), 0);
  assert.equal(totalA, 11000, "Test A: real expenses total matches expected (not 22000)");

  // ---- Test B: reordered columns (Particulars | Credit | Debit | Date | Vch Type | Vch No.) — the exact reported bug ----
  const sheetB = [
    ...letterhead,
    ["Particulars", "Credit", "Debit", "Date", "Vch Type", "Vch No."],
    ["Travel Expenses", "", 5000, "2026-09-01", "Payment", "101"],
    ["Printing", "", 6000, "2026-09-02", "Payment", "102"],
    ["Current Total :", "", 11000, "", "", ""],
  ];
  const parsedB = parseExpenseWorkbook(buildRawSheetWorkbook("PR TESTB", sheetB));
  const rowsB = parsedB.sheets[0]!.rows;
  assert.equal(rowsB.length, 2, "Test B: 'Current Total :' must NOT become a row at all");
  assert.ok(rowsB.every((r) => r.particulars !== "Current Total :"));
  const totalB = rowsB.reduce((s, r) => s + (r.outcome === "import" ? r.amount : 0), 0);
  assert.equal(totalB, 11000, "Test B: NO fake ₹11,000 expense — total is 11000, not 22000");

  // ---- Test C: another materially different column order (Debit | Date | Particulars | Credit | Vch No. | Vch Type) ----
  const sheetC = [
    ...letterhead,
    ["Debit", "Date", "Particulars", "Credit", "Vch No.", "Vch Type"],
    [5000, "2026-09-01", "Travel Expenses", "", "101", "Payment"],
    [6000, "2026-09-02", "Printing", "", "102", "Payment"],
    [11000, "", "Current Total :", "", "", ""],
  ];
  const parsedC = parseExpenseWorkbook(buildRawSheetWorkbook("PR TESTC", sheetC));
  const rowsC = parsedC.sheets[0]!.rows;
  assert.equal(rowsC.length, 2, "Test C: summary row excluded under a third, materially different column order");
  const totalC = rowsC.reduce((s, r) => s + (r.outcome === "import" ? r.amount : 0), 0);
  assert.equal(totalC, 11000);

  // ---- Test D: multiple distinct summary/balance labels, all in the Particulars column ----
  const sheetD = [
    ...letterhead,
    ["Particulars", "Debit", "Credit", "Date", "Vch Type", "Vch No."],
    ["Travel Expenses", 7000, "", "2026-09-01", "Payment", "201"],
    ["Current Total :", 7000, "", "", "", ""],
    ["Grand Total", 7000, "", "", "", ""],
    ["Opening Balance", "", "", "", "", ""],
    ["Closing Balance", 7000, "", "", "", ""],
  ];
  const parsedD = parseExpenseWorkbook(buildRawSheetWorkbook("PR TESTD", sheetD));
  const rowsD = parsedD.sheets[0]!.rows;
  assert.equal(rowsD.length, 1, "Test D: only the one real transaction row — none of the 4 summary labels become rows");
  assert.equal(rowsD[0]!.particulars, "Travel Expenses");

  // ---- Test E: legitimate rows that merely CONTAIN words like "total"/"balance" must still import ----
  const sheetE = [
    ...letterhead,
    ["Particulars", "Debit", "Credit", "Date", "Vch Type", "Vch No."],
    ["Total Travel expenses", 3000, "", "2026-09-01", "Payment", "301"], // real description, contains "Total" as a substring
    ["Balance transfer charges", 400, "", "2026-09-02", "Payment", "302"], // real description, contains "Balance" as a substring
  ];
  const parsedE = parseExpenseWorkbook(buildRawSheetWorkbook("PR TESTE", sheetE));
  const rowsE = parsedE.sheets[0]!.rows;
  assert.equal(rowsE.length, 2, "Test E: real rows containing 'total'/'balance' as substrings must NOT be filtered — no over-broad match");
  assert.equal(rowsE[0]!.outcome, "import");
  assert.equal((rowsE[0]! as { amount: number }).amount, 3000);
  assert.equal(rowsE[1]!.outcome, "import");
  assert.equal((rowsE[1]! as { amount: number }).amount, 400);
});

// ---------------------------------------------------------------------------
// P1 regression (Sept 2026 QA Finding 2) — content-based .xlsx validation.
// ---------------------------------------------------------------------------

test("parseExpenseWorkbook — Finding 2: a .txt file renamed to .xlsx is rejected, a genuine .xlsx is not", () => {
  // A renamed plain-text file — no ZIP "PK" signature at all. Before the
  // fix, xlsx's tolerant reader parsed this as a near-empty workbook instead
  // of throwing, which surfaced as an indistinguishable "nothing to import"
  // result rather than a clear rejection.
  const fakeXlsx = Buffer.from("This is just a plain text file, not really an Excel workbook.\n", "utf-8");
  assert.throws(() => parseExpenseWorkbook(fakeXlsx), /could not be read as an Excel workbook/);

  // An empty buffer — too short to even have a 2-byte signature.
  assert.throws(() => parseExpenseWorkbook(Buffer.alloc(0)), /could not be read as an Excel workbook/);

  // A buffer that starts with the ZIP signature but is otherwise garbage —
  // still correctly rejected, just by the existing XLSX.read() try/catch
  // (this check only proves the new pre-check doesn't swallow that path).
  const corruptZip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("not a real zip body")]);
  assert.throws(() => parseExpenseWorkbook(corruptZip), /could not be read as an Excel workbook/);

  // A genuine .xlsx workbook must still parse normally — no false rejection.
  const genuine = buildWorkbook([{ name: "PR GENUINE", rows: [txRow("2026-01-01", "Real row", "1", 500, "")] }]);
  assert.doesNotThrow(() => parseExpenseWorkbook(genuine));
  const parsedGenuine = parseExpenseWorkbook(genuine);
  assert.equal(parsedGenuine.sheets[0]!.rows.length, 1);
});

// ---------------------------------------------------------------------------
// P1 regression (Sept 2026 QA Finding 3) — malformed sheet structure gets a
// distinct classification from a genuinely valid, empty sheet.
// ---------------------------------------------------------------------------

test("parseExpenseWorkbook — Finding 3: malformed sheet structure is distinguishable from a valid-but-empty sheet", () => {
  const letterhead = [["IFluids Engineering"], ["Cost Centre Account"]];

  // Case 1: no header row at all (no "Particulars" cell anywhere).
  const noHeaderSheet = [...letterhead, ["Some random text"], ["More random text"]];
  const parsedNoHeader = parseExpenseWorkbook(buildRawSheetWorkbook("PR NOHEADER", noHeaderSheet));
  assert.equal(parsedNoHeader.sheets[0]!.isValidStructure, false);
  assert.equal(parsedNoHeader.sheets[0]!.rows.length, 0);

  // Case 2: header row present but missing Debit/Credit columns entirely.
  const missingColsSheet = [...letterhead, ["Particulars", "Remarks"], ["Travel Expenses", "some note"]];
  const parsedMissingCols = parseExpenseWorkbook(buildRawSheetWorkbook("PR MISSINGCOLS", missingColsSheet));
  assert.equal(parsedMissingCols.sheets[0]!.isValidStructure, false);
  assert.equal(parsedMissingCols.sheets[0]!.rows.length, 0);

  // Case 3: header row present with only unrelated columns (no Particulars/Debit/Credit at all).
  const unrelatedColsSheet = [...letterhead, ["Name", "Age", "City"], ["John", "30", "Chennai"]];
  const parsedUnrelated = parseExpenseWorkbook(buildRawSheetWorkbook("PR UNRELATED", unrelatedColsSheet));
  assert.equal(parsedUnrelated.sheets[0]!.isValidStructure, false);

  // Case 4: header row present, all required columns present, genuinely zero data rows — a VALID, empty sheet.
  const validEmptySheet = [...letterhead, ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"]];
  const parsedValidEmpty = parseExpenseWorkbook(buildRawSheetWorkbook("PR VALIDEMPTY", validEmptySheet));
  assert.equal(parsedValidEmpty.sheets[0]!.isValidStructure, true, "a valid header with zero rows must NOT be flagged malformed");
  assert.equal(parsedValidEmpty.sheets[0]!.rows.length, 0);

  // Case 5: header present, all required columns present, only summary rows follow (still valid structure, zero real rows).
  const onlySummarySheet = [
    ...letterhead,
    ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"],
    ["", "Opening Balance :", "", "", "", ""],
    ["", "Closing Balance :", "", "", "", ""],
  ];
  const parsedOnlySummary = parseExpenseWorkbook(buildRawSheetWorkbook("PR ONLYSUMMARY", onlySummarySheet));
  assert.equal(parsedOnlySummary.sheets[0]!.isValidStructure, true);
  assert.equal(parsedOnlySummary.sheets[0]!.rows.length, 0);

  // Case 6: a normal, valid sheet with real rows — isValidStructure true, as the Finding 1 regression tests above already assume.
  const normalSheet = [
    ...letterhead,
    ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"],
    ["2026-09-01", "Travel Expenses", "Payment", "101", 5000, ""],
  ];
  const parsedNormal = parseExpenseWorkbook(buildRawSheetWorkbook("PR NORMAL", normalSheet));
  assert.equal(parsedNormal.sheets[0]!.isValidStructure, true);
  assert.equal(parsedNormal.sheets[0]!.rows.length, 1);
});

test("Other Project Expenses Excel Import — Finding 3: an invalid-format sheet reports 'invalidFormat' via HTTP, distinct from 'noImportableRows', and writes nothing", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const tag = `${TAG}f3`;

  try {
    const [role, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("ExpenseImportTest@123");
    const user = await prisma.portalUser.create({
      data: {
        fullName: "Expense Import Finding3 Test User",
        email: `${tag}-importer@example.com`,
        passwordHash,
        department: "PMO",
        roleId: role.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(user.id);
    const token = tokenFor({ ...user, roleName: role.name });
    const authHeaders = { Authorization: `Bearer ${token}` };

    const project = await prisma.project.create({ data: projectPayload(`PR-${tag}9`, "Finding 3 test project") });
    createdProjectIds.push(project.id);

    // A workbook with two sheets: one genuinely malformed (no header row),
    // one a valid, real sheet for the same project — proving the malformed
    // sheet is reported distinctly and doesn't block the valid sheet.
    const wb = XLSX.utils.book_new();
    const malformedWs = XLSX.utils.aoa_to_sheet([["random junk"], ["more junk"]]);
    XLSX.utils.book_append_sheet(wb, malformedWs, `PR ${tag}9-malformed`);
    const validWs = XLSX.utils.aoa_to_sheet(sheetAoa([txRow("2026-01-01", "Travel Expenses", "1", 1000, "")]));
    XLSX.utils.book_append_sheet(wb, validWs, `PR ${tag}9`);
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const form = new FormData();
    form.append("file", xlsxFile(buffer));
    const res = await fetch(`${url}/projects/expenses/import`, { method: "POST", headers: authHeaders, body: form });
    assert.equal(res.status, 200);
    const body = (await res.json()) as ApiEnvelope<ImportResultDto>;
    const result = body.data!;

    const malformedSheet = result.sheets.find((s) => s.sheetName === `PR ${tag}9-malformed`)!;
    assert.equal(malformedSheet.changeStatus, "invalidFormat");
    assert.equal(malformedSheet.matchedProjectId, null);
    assert.ok(malformedSheet.unmatchedReason);

    const validSheet = result.sheets.find((s) => s.sheetName === `PR ${tag}9`)!;
    assert.equal(validSheet.changeStatus, "newImport");
    assert.equal(validSheet.matchedProjectId, project.id);

    // Nothing was written for the malformed sheet.
    const expenses = await prisma.projectExpense.findMany({ where: { projectId: project.id, isActive: true } });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0]!.totalCost, 1000);
  } finally {
    await prisma.projectExpense.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.expenseImportBatch.deleteMany({ where: { uploadedByUserId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});

// ---------------------------------------------------------------------------
// P1 regression (Sept 2026 QA Finding 4) — a raw fileHash unique-constraint
// race (two near-simultaneous commit requests for the same bytes) resolves
// to the same graceful "RejectedDuplicate" shape instead of a raw 409.
// ---------------------------------------------------------------------------

test("Other Project Expenses Excel Import — Finding 4: two simultaneous commit requests for the same file never both succeed, and the loser gets 'RejectedDuplicate' not a raw error", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const tag = `${TAG}f4`;

  try {
    const [role, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("ExpenseImportTest@123");
    const user = await prisma.portalUser.create({
      data: {
        fullName: "Expense Import Finding4 Test User",
        email: `${tag}-importer@example.com`,
        passwordHash,
        department: "PMO",
        roleId: role.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(user.id);
    const token = tokenFor({ ...user, roleName: role.name });
    const authHeaders = { Authorization: `Bearer ${token}` };

    const project = await prisma.project.create({ data: projectPayload(`PR-${tag}9`, "Finding 4 test project") });
    createdProjectIds.push(project.id);

    const workbook = buildWorkbook([{ name: `PR ${tag}9`, rows: [txRow("2026-01-01", "Travel Expenses", "1", 1000, "")] }]);

    // Fire two commit requests for the identical bytes at (as close to)
    // the same instant as possible — reproducing a rapid double-click.
    const [res1, res2] = await Promise.all([
      fetch(`${url}/projects/expenses/import`, {
        method: "POST",
        headers: authHeaders,
        body: (() => {
          const f = new FormData();
          f.append("file", xlsxFile(workbook));
          return f;
        })(),
      }),
      fetch(`${url}/projects/expenses/import`, {
        method: "POST",
        headers: authHeaders,
        body: (() => {
          const f = new FormData();
          f.append("file", xlsxFile(workbook));
          return f;
        })(),
      }),
    ]);

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    const body1 = (await res1.json()) as ApiEnvelope<ImportResultDto>;
    const body2 = (await res2.json()) as ApiEnvelope<ImportResultDto>;

    const statuses = [body1.data!.status, body2.data!.status].sort();
    // Exactly one request wins ("Succeeded") and the other loses gracefully
    // ("RejectedDuplicate") — never both succeeding, never a raw error shape.
    assert.deepEqual(statuses, ["RejectedDuplicate", "Succeeded"]);

    const loser = body1.data!.status === "RejectedDuplicate" ? body1.data! : body2.data!;
    const winner = body1.data!.status === "Succeeded" ? body1.data! : body2.data!;
    assert.ok(loser.rejectedDuplicateOfBatchId);
    assert.equal(loser.rejectedDuplicateOfBatchId, winner.batchId);

    // Exactly one batch, exactly one row-set — no duplication.
    const batches = await prisma.expenseImportBatch.findMany({ where: { uploadedByUserId: user.id } });
    assert.equal(batches.length, 1);
    const expenses = await prisma.projectExpense.findMany({ where: { projectId: project.id } });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0]!.totalCost, 1000);

    // A genuinely new, different file for the same project still imports normally afterward.
    const workbook2 = buildWorkbook([
      { name: `PR ${tag}9`, rows: [txRow("2026-01-01", "Travel Expenses", "1", 1000, ""), txRow("2026-01-02", "Printing & Stationery", "2", 200, "")] },
    ]);
    const form3 = new FormData();
    form3.append("file", xlsxFile(workbook2));
    const res3 = await fetch(`${url}/projects/expenses/import`, { method: "POST", headers: authHeaders, body: form3 });
    const body3 = (await res3.json()) as ApiEnvelope<ImportResultDto>;
    assert.equal(body3.data!.status, "Succeeded");
  } finally {
    await prisma.projectExpense.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.expenseImportBatch.deleteMany({ where: { uploadedByUserId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});

// ---------------------------------------------------------------------------
// Insurance category mapping (approved 2026-09-29).
// ---------------------------------------------------------------------------

test("mapParticularsToCategory — Insurance maps to 'Staff Welfare - Insurance', no longer pending", async () => {
  const { mapParticularsToCategory } = await import("./expenseImport.constants.js");
  const outcome = mapParticularsToCategory("Insurance");
  assert.deepEqual(outcome, { kind: "mapped", category: "Staff Welfare - Insurance" });

  // The other two ambiguous values remain untouched by this change.
  assert.deepEqual(mapParticularsToCategory("Consultancy Fees"), { kind: "pendingDecision" });
  assert.deepEqual(mapParticularsToCategory("Consultancy Fees - Foreign"), { kind: "pendingDecision" });
});

// ---------------------------------------------------------------------------
// Full integration suite — real HTTP, real Postgres.
// ---------------------------------------------------------------------------

test("Other Project Expenses Excel Import — full lifecycle", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [role, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("ExpenseImportTest@123");
    const user = await prisma.portalUser.create({
      data: {
        fullName: "Expense Import Test User",
        email: `${TAG}-importer@example.com`,
        passwordHash,
        department: "PMO",
        roleId: role.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(user.id);
    const token = tokenFor({ ...user, roleName: role.name });
    const authHeaders = { Authorization: `Bearer ${token}` };

    const [projectA, projectB, projectC] = await Promise.all([
      prisma.project.create({ data: projectPayload(`PR-${PR_A}`, "PR A test project") }),
      prisma.project.create({ data: projectPayload(`PR-${PR_B}`, "PR B test project") }),
      prisma.project.create({ data: projectPayload(`PR-${PR_C}`, "PR C test project") }),
    ]);
    createdProjectIds.push(projectA.id, projectB.id, projectC.id);

    // ---- 1. First import: real PR-series data, three sheets ----
    const workbook1 = buildWorkbook([
      { name: `PR ${PR_A}`, rows: prARows() },
      { name: `PR ${PR_B}`, rows: prBRows() },
      { name: `PR ${PR_C}`, rows: prCRows() },
    ]);
    const form1 = new FormData();
    form1.append("file", xlsxFile(workbook1));
    const res1 = await fetch(`${url}/projects/expenses/import`, { method: "POST", headers: authHeaders, body: form1 });
    assert.equal(res1.status, 200);
    const body1 = (await res1.json()) as ApiEnvelope<ImportResultDto>;
    const result1 = body1.data!;
    assert.equal(result1.status, "Succeeded");

    const sheetA1 = result1.sheets.find((s) => s.matchedProjectId === projectA.id)!;
    const sheetB1 = result1.sheets.find((s) => s.matchedProjectId === projectB.id)!;
    const sheetC1 = result1.sheets.find((s) => s.matchedProjectId === projectC.id)!;

    // PR matching worked despite "PR <TAG>5" (Excel) vs "PR-<TAG>5" (DB) — normalizeProjectCode() reuse confirmed.
    assert.equal(sheetA1.matchedPrNo, `PR-${PR_A}`);
    assert.equal(sheetA1.changeStatus, "newImport");
    assert.equal(sheetA1.computedDebitOnlyTotal, 76048.7);

    assert.equal(sheetC1.changeStatus, "newImport");
    assert.equal(sheetC1.computedDebitOnlyTotal, 40149.45);

    // PR B — Insurance rows map to "Staff Welfare - Insurance" (approved
    // 2026-09-29): importable total is the full audited Debit-only
    // 183,724.00, and neither Insurance row is pending a category decision.
    assert.equal(sheetB1.changeStatus, "newImport");
    assert.equal(sheetB1.computedDebitOnlyTotal, 183724);
    assert.equal(sheetB1.rowsPendingCategoryDecision.length, 0);
    const insuranceRows = sheetB1.rowsImportable.filter((r) => r.particulars === "Insurance");
    assert.equal(insuranceRows.length, 2);
    assert.ok(insuranceRows.every((r) => r.category === "Staff Welfare - Insurance"));
    assert.equal(
      insuranceRows.reduce((s, r) => s + r.amount, 0),
      2897
    );

    // Credit-only rows correctly excluded, never used as a fallback — the
    // two Domestic-Travel credit rows AND the "Consultancy Fees" ₹132,000
    // credit row (which never even reaches category mapping, since it's
    // excluded as Credit-only before that point — confirming the earlier
    // audit finding that this specific ambiguous Particulars value never
    // actually needs a mapping decision in this dataset).
    assert.equal(sheetA1.rowsSkippedCreditOnly.length, 3);
    assert.ok(sheetA1.rowsSkippedCreditOnly.some((r) => r.creditAmount === 1141.3));
    assert.ok(sheetA1.rowsSkippedCreditOnly.some((r) => r.creditAmount === 1484.7));
    assert.ok(sheetA1.rowsSkippedCreditOnly.some((r) => r.particulars === "Consultancy Fees" && r.creditAmount === 132000));

    // Anomaly flag: none of the real sample rows have both Debit+Credit populated.
    assert.ok(!sheetA1.rowsImportable.some((r) => r.anomaly));

    // Verify actual persisted rows/totals in Postgres.
    const expensesA = await prisma.projectExpense.findMany({ where: { projectId: projectA.id, isActive: true } });
    assert.equal(expensesA.length, 10); // 13 rows found - 3 credit-only-skipped
    assert.equal(
      expensesA.reduce((s, e) => s + e.totalCost, 0),
      76048.7
    );
    assert.ok(expensesA.every((e) => e.importBatchId === result1.batchId));

    // PR B importable rows: Domestic(130368), Insurance(1992), Insurance(905), Foreign(49879), Domestic(580) = 5 rows;
    // Consultancy Fees-Foreign credit-only (skipped, unaffected by the Insurance mapping change).
    const expensesB = await prisma.projectExpense.findMany({ where: { projectId: projectB.id, isActive: true } });
    assert.equal(expensesB.length, 5);
    assert.ok(expensesB.some((e) => e.category === "Staff Welfare - Insurance" && e.totalCost === 1992));
    assert.ok(expensesB.some((e) => e.category === "Staff Welfare - Insurance" && e.totalCost === 905));

    // ---- 2. Exact same file re-uploaded: rejected, zero new writes ----
    const form2 = new FormData();
    form2.append("file", xlsxFile(workbook1));
    const res2 = await fetch(`${url}/projects/expenses/import`, { method: "POST", headers: authHeaders, body: form2 });
    assert.equal(res2.status, 200);
    const body2 = (await res2.json()) as ApiEnvelope<ImportResultDto>;
    assert.equal(body2.data!.status, "RejectedDuplicate");
    assert.equal(body2.data!.rejectedDuplicateOfBatchId, result1.batchId);
    const countAfterDuplicate = await prisma.projectExpense.count({ where: { projectId: { in: createdProjectIds } } });
    assert.equal(countAfterDuplicate, expensesA.length + expensesB.length + 7); // PR C = 7 rows, no double-counting

    // ---- 3. Changed file: PR A's amount changes, PR C's sheet is dropped entirely (missing-PR rule), PR B unchanged ----
    const changedPrARows = prARows();
    // Bump the first row's Debit from 2661 -> 5000 (a real content change).
    (changedPrARows[0] as unknown[])[4] = 5000;
    const workbook3 = buildWorkbook([
      { name: `PR ${PR_A}`, rows: changedPrARows },
      { name: `PR ${PR_B}`, rows: prBRows() }, // identical content -> should be "unchangedSkipped"
      // PR C sheet intentionally OMITTED — §8 missing-PR rule: its rows must remain untouched.
    ]);
    const form3 = new FormData();
    form3.append("file", xlsxFile(workbook3));
    const res3 = await fetch(`${url}/projects/expenses/import`, { method: "POST", headers: authHeaders, body: form3 });
    assert.equal(res3.status, 200);
    const body3 = (await res3.json()) as ApiEnvelope<ImportResultDto>;
    const result3 = body3.data!;
    assert.equal(result3.status, "Succeeded");
    assert.notEqual(result3.batchId, result1.batchId);

    const sheetA3 = result3.sheets.find((s) => s.matchedProjectId === projectA.id)!;
    const sheetB3 = result3.sheets.find((s) => s.matchedProjectId === projectB.id)!;
    assert.equal(sheetA3.changeStatus, "changedWillSupersede");
    assert.equal(sheetB3.changeStatus, "unchangedSkipped");

    // PR A: old batch's rows now inactive, new batch's rows active, totals correct, no double-contribution.
    const projectAAllRows = await prisma.projectExpense.findMany({ where: { projectId: projectA.id } });
    const projectAActiveRows = projectAAllRows.filter((r) => r.isActive);
    const projectAInactiveRows = projectAAllRows.filter((r) => !r.isActive);
    assert.equal(projectAInactiveRows.length, 10); // the original batch's 10 rows, preserved for audit, never deleted
    assert.ok(projectAInactiveRows.every((r) => r.importBatchId === result1.batchId));
    assert.equal(projectAActiveRows.length, 10);
    assert.ok(projectAActiveRows.every((r) => r.importBatchId === result3.batchId));
    assert.equal(
      projectAActiveRows.reduce((s, e) => s + e.totalCost, 0),
      76048.7 + (5000 - 2661) // original total + the one row's increase
    );

    // PR B: completely untouched by this second upload (unchanged content) — same batch id as before, same row count.
    const projectBRowsAfter = await prisma.projectExpense.findMany({ where: { projectId: projectB.id, isActive: true } });
    assert.equal(projectBRowsAfter.length, 5);
    assert.ok(projectBRowsAfter.every((r) => r.importBatchId === result1.batchId));

    // PR C: missing from workbook3 entirely — §8 rule — must remain fully untouched (still active, still batch 1).
    const projectCRowsAfter = await prisma.projectExpense.findMany({ where: { projectId: projectC.id } });
    assert.equal(projectCRowsAfter.length, 7);
    assert.ok(projectCRowsAfter.every((r) => r.isActive && r.importBatchId === result1.batchId));

    // ---- 4. Unmatched PR: reported, zero orphan rows ----
    const workbook4 = buildWorkbook([{ name: `PR ${TAG}-DOES-NOT-EXIST`, rows: prCRows() }]);
    const form4 = new FormData();
    form4.append("file", xlsxFile(workbook4));
    const res4 = await fetch(`${url}/projects/expenses/import`, { method: "POST", headers: authHeaders, body: form4 });
    const body4 = (await res4.json()) as ApiEnvelope<ImportResultDto>;
    const sheet4 = body4.data!.sheets[0]!;
    assert.equal(sheet4.changeStatus, "unmatchedPr");
    assert.equal(sheet4.matchedProjectId, null);
    assert.ok(sheet4.unmatchedReason);
    const countAfterUnmatched = await prisma.projectExpense.count({ where: { projectId: { in: createdProjectIds } } });
    assert.equal(countAfterUnmatched, projectAAllRows.length + projectBRowsAfter.length + projectCRowsAfter.length);

    // ---- 5. Existing manual expense gates the import until explicitly confirmed ----
    const manualExpense = await prisma.projectExpense.create({
      data: {
        projectId: projectC.id,
        category: "Miscellaneous Expenses",
        description: "Manually entered before any import",
        quantity: 1,
        unitCost: 5000,
        totalCost: 5000,
        // importBatchId intentionally omitted -> null -> a genuinely manual row.
      },
    });

    const workbook5 = buildWorkbook([{ name: `PR ${PR_C}`, rows: [...prCRows(), txRow("2026-09-10", "Domestic - Travel Expenses", "9999", 999, "")] }]);
    const form5a = new FormData();
    form5a.append("file", xlsxFile(workbook5));
    const res5a = await fetch(`${url}/projects/expenses/import`, { method: "POST", headers: authHeaders, body: form5a });
    const body5a = (await res5a.json()) as ApiEnvelope<ImportResultDto>;
    const sheet5a = body5a.data!.sheets[0]!;
    assert.equal(sheet5a.changeStatus, "awaitingManualConfirmation");
    assert.equal(sheet5a.existingManualExpenses.length, 1);
    assert.equal(sheet5a.existingManualExpenses[0]!.id, manualExpense.id);
    // Not written — PR C's imported rows are exactly as they were before this call.
    const projectCAfterGatedAttempt = await prisma.projectExpense.count({ where: { projectId: projectC.id, importBatchId: { not: null } } });
    assert.equal(projectCAfterGatedAttempt, 7);

    const form5b = new FormData();
    form5b.append("file", xlsxFile(workbook5));
    form5b.append("confirmedProjectIds", JSON.stringify([projectC.id]));
    const res5b = await fetch(`${url}/projects/expenses/import`, { method: "POST", headers: authHeaders, body: form5b });
    const body5b = (await res5b.json()) as ApiEnvelope<ImportResultDto>;
    const sheet5b = body5b.data!.sheets[0]!;
    assert.equal(sheet5b.changeStatus, "changedWillSupersede"); // total changed (extra 999 row) once confirmed
    const manualStillIntact = await prisma.projectExpense.findUnique({ where: { id: manualExpense.id } });
    assert.ok(manualStillIntact);
    assert.equal(manualStillIntact!.isActive, true);
    assert.equal(manualStillIntact!.totalCost, 5000); // completely untouched by the import that just ran on the SAME project
  } finally {
    await prisma.projectExpense.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.expenseImportBatch.deleteMany({ where: { uploadedByUserId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
