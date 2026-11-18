// Global Multi-Country Phase 2 (frontend): the import parser's blank-PR-Category rule, the interpretation of the backend's per-row check, and
// the preview dialog. The backend is the authority on country and authorization; these tests prove only what the UI sends and shows.
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

const row = (over = {}) => ({
  index: 0,
  rowNumber: 2,
  prNo: "PR-1",
  prCategory: "India",
  country: { code: "india", name: "India", displayName: "India" },
  countryStatus: "ok",
  duplicate: "none",
  errors: [],
  ...over,
});
const summary = (over = {}) => ({ total: 1, ok: 1, byCountry: [{ country: "India", rows: 1 }], blankCategory: 0, unknownCategory: 0, noCountry: 0, notAuthorized: 0, duplicateInFile: 0, duplicateExisting: 0, ...over });
const preview = (rows, over = {}) => ({ enforced: true, rows, summary: summary({ total: rows.length }), ...over });

// ---- the parser -------------------------------------------------------------------------------------------------------------
async function sampleWorkbook() {
  const svc = await load("/src/services/projectWorkbookService.ts");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = await svc.buildSampleTemplateWorkbook();
  return { svc, workbook, ExcelJS };
}

function headerColumn(sheet, header) {
  let found = 0;
  sheet.getRow(1).eachCell((cell, col) => {
    if (String(cell.value ?? "").trim() === header) found = col;
  });
  return found;
}

test("the parser rejects a row with a blank PR Category and never fills it in from the PR Number prefix", async () => {
  const { svc, workbook } = await sampleWorkbook();
  const sheet = workbook.getWorksheet("Projects");
  const catCol = headerColumn(sheet, "PR Category");
  const prCol = headerColumn(sheet, "PR Number");
  assert.ok(catCol > 0 && prCol > 0, "the template has the PR Number and PR Category columns");
  sheet.getRow(2).getCell(prCol).value = "EE-Q-1234"; // a prefix that WOULD be guessed as Elixir Qatar by the old fallback
  sheet.getRow(2).getCell(catCol).value = "";
  const result = svc.parseProjectsWorkbook(workbook, []);
  assert.ok(
    result.errors.some((e) => /Row 2: PR Category is blank/.test(e) && /never guessed/.test(e)),
    `expected a blank-category row error, got: ${JSON.stringify(result.errors)}`
  );
});

test("a typed PR Category is kept as typed, row by row, so one file can mix countries; each parsed row reports its Excel row number", async () => {
  const { svc, workbook } = await sampleWorkbook();
  const sheet = workbook.getWorksheet("Projects");
  const catCol = headerColumn(sheet, "PR Category");
  const prCol = headerColumn(sheet, "PR Number");
  const dataRows = [];
  sheet.eachRow((_r, n) => {
    if (n >= 2) dataRows.push(n);
  });
  assert.ok(dataRows.length >= 1);
  // Row 2 -> Oman, whatever its PR Number looks like: the category, not the number, is what the row says. (The PR Number is left alone
  // because the other sheets refer to it.)
  const prNo = String(sheet.getRow(2).getCell(prCol).value ?? "").trim();
  sheet.getRow(2).getCell(catCol).value = "Oman";
  const result = svc.parseProjectsWorkbook(workbook, []);
  assert.deepEqual(result.errors, [], "the sample workbook parses cleanly");
  const first = result.rows?.find((r) => r.rowNumber === 2);
  assert.deepEqual(first, { rowNumber: 2, prNo, prCategory: "Oman" });
  assert.equal(result.rows?.length, result.projects.length, "one report row per project");
});

test("the old prefix guess is still used for display of legacy records, but the import parser no longer calls it for a blank cell", () => {
  const parser = src("services/projectWorkbookService.ts");
  assert.match(parser, /const prCategory = prCategoryRaw\.trim\(\) \? inferPrCategory\(prNo, prCategoryRaw\) : ""/);
  assert.match(src("utils/createEmptyProject.ts"), /export function inferPrCategory/);
});

// ---- interpreting the backend's per-row check ---------------------------------------------------------------------------------
test("a row blocks the import for a duplicate always, and for a country problem only while the server enforces country access", async () => {
  const svc = await load("/src/services/projectCountryImportService.ts");
  assert.equal(svc.rowBlocks(row(), true), false);
  assert.equal(svc.rowBlocks(row({ duplicate: "in_file" }), false), true);
  assert.equal(svc.rowBlocks(row({ duplicate: "existing" }), true), true);
  assert.equal(svc.rowBlocks(row({ countryStatus: "not_authorized" }), true), true);
  assert.equal(svc.rowBlocks(row({ countryStatus: "not_authorized" }), false), false, "not enforced yet: shown, not blocked");
  for (const status of ["blank_category", "unknown_category", "no_country"]) assert.equal(svc.rowBlocks(row({ countryStatus: status }), true), true);
});

test("the whole preview blocks when any one row blocks (all or nothing)", async () => {
  const svc = await load("/src/services/projectCountryImportService.ts");
  assert.equal(svc.previewBlocksImport(preview([row(), row({ index: 1, rowNumber: 3 })])), false);
  assert.equal(svc.previewBlocksImport(preview([row(), row({ index: 1, rowNumber: 3, countryStatus: "not_authorized" })])), true);
  assert.equal(svc.previewBlocksImport(preview([row({ countryStatus: "not_authorized" })], { enforced: false })), false);
});

test("status labels read in plain words", async () => {
  const svc = await load("/src/services/projectCountryImportService.ts");
  assert.equal(svc.countryStatusLabel("ok", true), "Authorized");
  assert.equal(svc.countryStatusLabel("not_authorized", true), "Not authorized");
  assert.match(svc.countryStatusLabel("not_authorized", false), /not yet enforced/);
  assert.equal(svc.countryStatusLabel("blank_category", true), "PR Category blank");
});

test("the row report of a rejected import is read from the error; any other error is not mistaken for one", async () => {
  const svc = await load("/src/services/projectCountryImportService.ts");
  const { ApiError } = await load("/src/services/apiClient.ts");
  const details = { rejectedRows: [{ rowNumber: 3, prNo: "EE-9", prCategory: "Oman", country: "Oman", status: "not_authorized", errors: ["You do not have access to Oman."] }], totalRejectedRows: 1, truncated: false };
  const rejection = svc.importRejectionFromError(new ApiError(403, "Import rejected: 1 row(s) cannot be imported because of their country. No projects were created.", false, details));
  assert.equal(rejection?.rows[0].rowNumber, 3);
  assert.equal(rejection?.total, 1);
  assert.equal(svc.importRejectionFromError(new ApiError(409, "The following PR Numbers already exist.")), null);
  assert.equal(svc.importRejectionFromError(new ApiError(403, "No details here")), null);
  assert.equal(svc.importRejectionFromError(new Error("boom")), null);
});

test("the import is not mistaken for a country-selector rejection (which would reset the user's active country)", async () => {
  const { isCountryContextRejection } = await load("/src/auth/countryContextLogic.ts");
  assert.equal(isCountryContextRejection(403, "Import rejected: 2 row(s) cannot be imported because of their country. No projects were created."), false);
  assert.equal(isCountryContextRejection(403, "You do not have access to create projects for Oman."), false);
});

test("the frontend keeps no PR Category to country table of its own: it asks the backend", () => {
  const service = src("services/projectCountryImportService.ts");
  assert.match(service, /\/projects\/import\/preview/);
  assert.match(service, /\/projects\/pr-category-countries/);
  assert.doesNotMatch(service, /Oman|Qatar|Malaysia|Abu Dhabi/, "no country names are hard-coded in the import service");
});

// ---- the dialog ---------------------------------------------------------------------------------------------------------------
async function panel(props) {
  const mod = await load("/src/pages/Projects/components/ProjectImportPreviewModal.tsx");
  return renderToStaticMarkup(React.createElement(mod.ProjectImportPreviewPanel, { onConfirm: () => undefined, onClose: () => undefined, ...props }));
}

test("a clean preview shows each row's number, PR Number, category and country, and offers the import", async () => {
  const html = await panel({
    preview: preview(
      [
        row({ rowNumber: 2, prNo: "PR-1", prCategory: "India" }),
        row({ index: 1, rowNumber: 3, prNo: "EE-7", prCategory: "Oman", country: { code: "oman", name: "Oman", displayName: "Oman" } }),
      ],
      { summary: summary({ total: 2, byCountry: [{ country: "India", rows: 1 }, { country: "Oman", rows: 1 }] }) }
    ),
  });
  assert.match(html, /Review the import/);
  assert.match(html, /PR-1/);
  assert.match(html, /EE-7/);
  assert.match(html, />Oman</);
  assert.match(html, /Authorized/);
  assert.match(html, /Import 2 project\(s\)/);
});

test("a preview with a problem row cannot be imported: it explains why, lists the problem first, and has no import button", async () => {
  const html = await panel({
    preview: preview(
      [
        row({ rowNumber: 2 }),
        row({ index: 1, rowNumber: 5, prNo: "EE-9", prCategory: "Oman", countryStatus: "not_authorized", errors: ["You do not have access to Oman."] }),
        row({ index: 2, rowNumber: 6, prNo: "PR-6", prCategory: "", country: null, countryStatus: "blank_category", errors: ["PR Category is blank. Fill it in; the country is never guessed from the PR Number prefix."] }),
      ],
      { summary: summary({ total: 3, notAuthorized: 1, blankCategory: 1 }) }
    ),
  });
  assert.match(html, /This file cannot be imported yet/);
  assert.match(html, /2 row\(s\) need attention/);
  assert.match(html, /You do not have access to Oman\./);
  assert.match(html, /\(not identified\)/);
  assert.doesNotMatch(html, /Import 3 project/);
  assert.ok(html.indexOf("EE-9") < html.indexOf("PR-1"), "problem rows come before the good ones");
});

test("when country access is not enforced the preview warns but does not block", async () => {
  const html = await panel({
    preview: preview([row({ countryStatus: "not_authorized", errors: ["You do not have access to India."] })], { enforced: false, summary: summary({ notAuthorized: 1 }) }),
  });
  assert.match(html, /not enforced on this server yet/);
  assert.match(html, /Import 1 project\(s\)/);
});

test("duplicates block in every mode", async () => {
  const html = await panel({ preview: preview([row({ duplicate: "existing", errors: ['PR Number "PR-1" already exists.'] })], { enforced: false, summary: summary({ duplicateExisting: 1 }) }) });
  assert.match(html, /This file cannot be imported yet/);
  assert.match(html, /Already exists/);
});

test("a rejected import shows the server's row report and says nothing was created", async () => {
  const html = await panel({
    rejection: {
      message: "Import rejected: 1 row(s) cannot be imported because of their country. No projects were created.",
      rows: [{ rowNumber: 4, prNo: "Q-PR-1", prCategory: "Qatar", country: "Qatar", status: "not_authorized", errors: ["You do not have access to Qatar."] }],
      total: 1,
      truncated: false,
    },
  });
  assert.match(html, /Import rejected: no projects were created/);
  assert.match(html, /Q-PR-1/);
  assert.match(html, /You do not have access to Qatar\./);
  assert.doesNotMatch(html, /Import \d+ project/);
});

test("a very large preview draws a capped number of rows, problems first, and says so", async () => {
  const mod = await load("/src/pages/Projects/components/ProjectImportPreviewModal.tsx");
  const many = Array.from({ length: mod.IMPORT_PREVIEW_MAX_ROWS + 50 }, (_, i) => row({ index: i, rowNumber: i + 2, prNo: `PR-${i}` }));
  many.push(row({ index: many.length, rowNumber: 9999, prNo: "LAST-BAD", countryStatus: "not_authorized", errors: ["x"] }));
  const html = await panel({ preview: preview(many, { summary: summary({ total: many.length, notAuthorized: 1 }) }) });
  assert.match(html, /LAST-BAD/, "a blocking row is never hidden by the cap");
  assert.match(html, new RegExp(`Showing the first ${mod.IMPORT_PREVIEW_MAX_ROWS} of ${many.length} rows`));
});

test("Projects.tsx previews through the backend and only imports after confirmation", () => {
  const page = src("pages/Projects/Projects.tsx");
  assert.match(page, /previewProjectImport\(/);
  assert.match(page, /const confirmImport = async/);
  assert.match(page, /importRejectionFromError\(err\)/);
  // The import call lives in confirmImport, after the preview step, not in the file-selection handler.
  assert.ok(page.indexOf("previewProjectImport(") < page.indexOf("bulkImportProjectGeneralInfo(imported)"));
});

// ---- the Add / Edit Project form ---------------------------------------------------------------------------------------------
const reference = (enforced = true) => ({
  enforced,
  items: [
    { prCategory: "India", prNoPrefix: "PR-", country: { code: "india", name: "India", displayName: "India" }, authorized: true },
    { prCategory: "Oman", prNoPrefix: "EE", country: { code: "oman", name: "Oman", displayName: "Oman" }, authorized: false },
    { prCategory: "FZI", prNoPrefix: "PRI-", country: { code: "fze", name: "FZI", displayName: "FZE" }, authorized: true },
    { prCategory: "Qatar", prNoPrefix: "Q-PR-", country: null, authorized: false },
  ],
});

test("the PR Category field offers only what the backend would accept, and always keeps the project's current category", async () => {
  const svc = await load("/src/services/projectCountryImportService.ts");
  const add = { currentCategory: "", lockCountry: false };
  assert.equal(svc.categoryOptionState(reference(), "India", add).disabled, false);
  assert.equal(svc.categoryOptionState(reference(), "Oman", add).disabled, true, "a country the user does not hold");
  assert.equal(svc.categoryOptionState(reference(), "Qatar", add).disabled, true, "a category with no country configured");
  assert.equal(svc.categoryOptionState(reference(false), "Oman", add).disabled, false, "nothing is disabled while access is not enforced");
  assert.equal(svc.categoryOptionState(null, "Oman", add).disabled, false, "no reference loaded: offer everything, the server decides");
  assert.equal(svc.categoryOptionState(reference(), "Oman", { currentCategory: "Oman", lockCountry: false }).disabled, false, "the saved category is never disabled");
  assert.equal(svc.categoryOptionState(reference(), "FZI", add).label, "FZI (FZE)", "the stored name stays visible next to the display name");
  assert.equal(svc.categoryOptionState(reference(), "India", add).label, "India");
});

test("editing a saved project: every other country's category is not offered while access is enforced", async () => {
  const svc = await load("/src/services/projectCountryImportService.ts");
  const edit = { currentCategory: "India", lockCountry: true };
  assert.equal(svc.categoryOptionState(reference(), "India", edit).disabled, false);
  assert.equal(svc.categoryOptionState(reference(), "FZI", edit).disabled, true, "an authorized country too: moving a project is not available");
});

test("the helper line names the country, warns about a country the user does not hold, and explains the lock", async () => {
  const svc = await load("/src/services/projectCountryImportService.ts");
  assert.equal(svc.categoryHint(reference(), "India", { lockCountry: false }), "Country: India");
  assert.equal(svc.categoryHint(reference(), "FZI", { lockCountry: false }), "Country: FZE");
  assert.match(svc.categoryHint(reference(), "Oman", { lockCountry: false }), /do not have access to create projects for Oman/);
  assert.match(svc.categoryHint(reference(), "Qatar", { lockCountry: false }), /not linked to a country/);
  assert.match(svc.categoryHint(reference(), "India", { lockCountry: true }), /cannot be changed here/);
  assert.equal(svc.categoryHint(null, "India", { lockCountry: false }), null);
  assert.equal(svc.categoryHint(reference(), "", { lockCountry: false }), null);
  assert.equal(svc.categoryHint(reference(false), "Qatar", { lockCountry: false }), null, "no noise while access is not enforced");
});

test("PR Requests are untouched: the shared General Information card shows the country hint only when the form passes the reference", () => {
  assert.match(src("pages/Projects/components/ProjectForm.tsx"), /categoryCountries=\{prCategoryCountries\}/);
  assert.doesNotMatch(src("pages/PRRequests/RequestPRForm.tsx"), /categoryCountries/);
});
