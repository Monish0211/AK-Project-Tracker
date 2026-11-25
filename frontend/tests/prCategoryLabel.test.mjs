// PR Category "FZE" (Nov 2026): the stored value stays "FZI"; every screen and export shows "FZE". Display only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] } });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const SHOWN = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZE", "Elixir Qatar", "Qatar"];

test("only FZI is renamed on screen; every other category, blank and missing values are untouched", async () => {
  const { prCategoryLabel, prCategoryFromText } = await load("/src/utils/prCategoryLabel.ts");
  assert.equal(prCategoryLabel("FZI"), "FZE");
  assert.equal(prCategoryLabel("FZE"), "FZE");
  for (const c of SHOWN) assert.equal(prCategoryLabel(c), c);
  assert.deepEqual([prCategoryLabel(""), prCategoryLabel(null), prCategoryLabel(undefined)], ["", null, undefined]);
  for (const typed of ["FZE", "fze", " Fze "]) assert.equal(prCategoryFromText(typed), "FZI", typed);
  for (const typed of ["FZI", "India", "FZE Ltd", ""]) assert.equal(prCategoryFromText(typed), typed);
});

test("the dropdown offers the seven categories with FZE, whatever the server reference says, and the saved value stays FZI", async () => {
  const { PR_CATEGORIES } = await load("/src/utils/createEmptyProject.ts");
  const { categoryOptionState } = await load("/src/services/projectCountryImportService.ts");
  assert.equal(PR_CATEGORIES[4], "FZI", "stored value unchanged");
  const withReference = (displayName) => ({ enforced: true, items: [{ prCategory: "FZI", prNoPrefix: "PRI-", country: { code: "fze", name: "FZI", displayName }, authorized: true }] });
  // null = PR Request and screens without a reference; "FZI" = a database whose region has no display name of its own yet
  for (const reference of [null, withReference("FZE"), withReference("FZI")]) {
    assert.deepEqual(PR_CATEGORIES.map((c) => categoryOptionState(c === "FZI" ? reference : null, c, { currentCategory: "", lockCountry: false }).label), SHOWN);
  }
  assert.match(src("pages/Projects/components/GeneralInfoCard.tsx"), /value=\{category\}/, "the option value is the stored category");
});

test("PR number rules, regional currency and country matching still use the stored FZI", async () => {
  const { inferPrCategory, PR_NUMBER_PREFIX_MAP } = await load("/src/utils/createEmptyProject.ts");
  assert.equal(PR_NUMBER_PREFIX_MAP.FZI, "PRI-");
  assert.equal(inferPrCategory("PRI-100", "FZI"), "FZI");
  assert.equal(inferPrCategory("PRI-100", "FZE"), "FZI");
  assert.equal(inferPrCategory("PRI-100", ""), "FZI");
});

test("Excel: the template and the export show FZE only, and importing the file stores FZI", async () => {
  const svc = await load("/src/services/projectWorkbookService.ts");
  const values = (workbook) => {
    const all = [];
    workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => all.push(String(cell.value ?? "")))));
    return all;
  };
  const template = await svc.buildSampleTemplateWorkbook();
  assert.ok(values(template).includes("FZE") && !values(template).includes("FZI"), "dropdown list");

  const sheet = template.getWorksheet("Projects");
  let catCol = 0;
  sheet.getRow(1).eachCell((cell, col) => {
    if (String(cell.value ?? "").trim() === "PR Category") catCol = col;
  });
  for (const typed of ["FZE", "FZI", "fze"]) {
    sheet.getRow(2).getCell(catCol).value = typed;
    const parsed = svc.parseProjectsWorkbook(template, []);
    assert.deepEqual(parsed.errors, [], typed);
    assert.equal(parsed.projects[0].prCategory, "FZI", typed);
    assert.equal(parsed.rows[0].prCategory, "FZI", `${typed}: what the server check receives`);
  }

  const exported = await svc.buildExportWorkbook([svc.parseProjectsWorkbook(template, []).projects[0]]);
  assert.equal(String(exported.getWorksheet("Projects").getRow(2).getCell(catCol).value), "FZE");
  assert.ok(!values(exported).includes("FZI"));
  assert.equal(svc.parseProjectsWorkbook(exported, []).projects[0].prCategory, "FZI", "export -> import round trip");
});

test("no screen lists a raw category: every PR_CATEGORIES option and category cell goes through the label", () => {
  assert.match(src("pages/Projects/Projects.tsx"), /\{prCategoryLabel\(c\)\}/);
  assert.match(src("pages/PRRequests/admin/AdminPRRequests.tsx"), /\{prCategoryLabel\(c\)\}[\s\S]*\{prCategoryLabel\(row\.prCategory\)/);
  assert.match(src("pages/PRRequests/PRRequestDetail.tsx"), /prCategoryLabel\(request\.projectData\.prCategory\)/);
  assert.match(src("pages/Reports/Reports.tsx"), /\{prCategoryLabel\(cat\)\}/);
  assert.match(src("components/reports/Shared/ReportFilters.tsx"), /\{prCategoryLabel\(cat\)\}/);
  assert.match(src("pages/Projects/components/GeneralView.tsx"), /prCategoryLabel\(inferPrCategory/);
  assert.match(src("pages/Projects/components/ProjectForm.tsx"), /prCategoryLabel\(inferPrCategory/);
});
