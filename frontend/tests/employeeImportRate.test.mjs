// Phase 4 / Option A safeguard for the Excel employee import: a BLANK or missing hourly-rate cell is "no rate provided" (sent to the server as an OMITTED rate,
// never 0) so an existing employee's saved rate is kept; unreadable text is flagged; a typed 0 stays an explicit 0; and the skipped rows are reported to the user.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };
globalThis.window ??= { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.__imports = [];
globalThis.__importResponse = { added: 0, updated: 0, totalImported: 0, invalid: 0 };

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        // The import posts the parsed rows; the test captures the request instead of calling a server.
        name: "stub-api-client",
        enforce: "pre",
        resolveId: (id) => (/\/apiClient$/.test(id) ? "virtual-stub-api-client" : null),
        load: (id) =>
          id === "virtual-stub-api-client"
            ? `export class ApiError extends Error {}
               export const apiClient = {
                 post: async (path, body) => { globalThis.__imports.push({ path, body }); return globalThis.__importResponse; },
                 get: async () => ({ items: [], total: 0, page: 1, pageSize: 200 }),
               };`
            : null,
      },
    ],
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const HEADER = ["Employee No", "Employee Name", "Designation", "Department", "Location", "Reporting Manager", "Employee Grade", "Man-hour Expenses", "Status"];

async function importSheet(rows, { header = HEADER } = {}) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Employees");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  const { importEmployeesFromExcel } = await load("/src/services/employeeService.ts");
  globalThis.__imports.length = 0;
  const result = await importEmployeesFromExcel(new File([bytes], "employees.xlsx"));
  return { result, sent: globalThis.__imports[0]?.body.employees ?? [] };
}

test("parseImportedRate: blank is null (not 0), unreadable text is null + UNREADABLE, an explicit 0 stays 0, symbols and separators are still stripped", async () => {
  const { parseImportedRate } = await load("/src/services/employeeService.ts");
  assert.deepEqual(parseImportedRate(""), { value: null });
  assert.deepEqual(parseImportedRate("   "), { value: null });
  assert.deepEqual(parseImportedRate("abc"), { value: null, issue: "UNREADABLE" });
  assert.deepEqual(parseImportedRate("-"), { value: null, issue: "UNREADABLE" });
  assert.deepEqual(parseImportedRate("."), { value: null, issue: "UNREADABLE" });
  assert.deepEqual(parseImportedRate("1.2.3"), { value: null, issue: "UNREADABLE" });
  assert.deepEqual(parseImportedRate("0"), { value: 0 });
  assert.deepEqual(parseImportedRate("0.00"), { value: 0 });
  assert.deepEqual(parseImportedRate("1500"), { value: 1500 });
  assert.deepEqual(parseImportedRate("₹1,200.50"), { value: 1200.5 });
  // Same stripping as before: a leading "Rs." leaves a stray dot, so that text is not a number. It used to become 0 silently; it is now reported as UNREADABLE.
  assert.deepEqual(parseImportedRate("Rs. 1,200.50"), { value: null, issue: "UNREADABLE" });
});

test("a blank rate cell is sent WITHOUT a rate (so the server keeps the saved one); a typed 0 and a typed rate are sent as numbers; unreadable text is flagged", async () => {
  const { sent } = await importSheet([
    ["E1", "Blank Rate", "Eng", "Process", "Chennai", "", "MG4", "", "Active"],
    ["E2", "Typed Rate", "Eng", "Process", "Chennai", "", "MG4", 1500, "Active"],
    ["E3", "Explicit Zero", "Eng", "Process", "Chennai", "", "MG4", 0, "Active"],
    ["E4", "Unreadable", "Eng", "Process", "Chennai", "", "MG4", "n/a", "Active"],
    ["E5", "Currency Text", "Eng", "Process", "Chennai", "", "MG4", "₹1,200.50", "Active"],
  ]);
  const by = Object.fromEntries(sent.map((row) => [row.employeeNo, row]));
  assert.equal("manhourExpenses" in by.E1, false, "blank => omitted, not 0");
  assert.equal(by.E1.rateIssue, undefined);
  assert.equal(by.E2.manhourExpenses, 1500);
  assert.equal(by.E3.manhourExpenses, 0, "explicit zero stays 0");
  assert.equal("manhourExpenses" in by.E4, false);
  assert.equal(by.E4.rateIssue, "UNREADABLE");
  assert.equal(by.E5.manhourExpenses, 1200.5);
  assert.equal(by.E1.designation, "Eng", "other fields are still sent");
});

test("a file with NO rate column at all sends no rate for any row", async () => {
  const header = HEADER.filter((h) => h !== "Man-hour Expenses");
  const { sent } = await importSheet([["E1", "No Column", "Eng", "Process", "Chennai", "", "MG4", "Active"]], { header });
  assert.equal(sent.length, 1);
  assert.equal("manhourExpenses" in sent[0], false);
});

test("the server's skipped-rate report reaches the import result; with none there is no field", async () => {
  globalThis.__importResponse = {
    added: 1, updated: 1, totalImported: 2, invalid: 0,
    ratesSkipped: [
      { employeeNo: "E1", reason: "NOT_PROVIDED", outcome: "EXISTING_RATE_KEPT" },
      { employeeNo: "E9", reason: "UNREADABLE", outcome: "CREATED_WITH_DEFAULT_0" },
    ],
  };
  const withSkips = await importSheet([["E1", "A", "Eng", "P", "C", "", "MG4", "", "Active"]]);
  assert.equal(withSkips.result.ratesSkipped.length, 2);
  globalThis.__importResponse = { added: 0, updated: 1, totalImported: 1, invalid: 0 };
  const none = await importSheet([["E1", "A", "Eng", "P", "C", "", "MG4", 10, "Active"]]);
  assert.equal(none.result.ratesSkipped, undefined);
});

test("importRateNote: says plainly which rates were kept and which new employees were created at 0, lists a few numbers, and is empty when nothing was skipped", async () => {
  const { importRateNote } = await load("/src/services/employeeService.ts");
  assert.equal(importRateNote(undefined), "");
  assert.equal(importRateNote([]), "");
  const note = importRateNote([
    { employeeNo: "E1", reason: "NOT_PROVIDED", outcome: "EXISTING_RATE_KEPT" },
    { employeeNo: "E2", reason: "UNREADABLE", outcome: "EXISTING_RATE_KEPT" },
    { employeeNo: "E9", reason: "NOT_PROVIDED", outcome: "CREATED_WITH_DEFAULT_0" },
  ]);
  assert.match(note, /2 employee\(s\) had a blank or unreadable hourly rate, so their saved rate was kept \(E1, E2\)/);
  assert.match(note, /1 new employee\(s\) had no readable rate and were created with a rate of 0/);
  assert.match(note, /\(E9\)/);
  const many = importRateNote(Array.from({ length: 8 }, (_, i) => ({ employeeNo: `X${i}`, reason: "NOT_PROVIDED", outcome: "EXISTING_RATE_KEPT" })));
  assert.match(many, /\(X0, X1, X2, X3, X4, \+3 more\)/);
});

test("the Manpower import toast uses the note and turns into a warning when rates were skipped", () => {
  const page = src("pages/Manpower/Manpower.tsx");
  assert.match(page, /importRateNote\(result\.ratesSkipped\)/);
  assert.match(page, /const warn = skippedCount > 0 \|\| rateNote !== ""/);
});
