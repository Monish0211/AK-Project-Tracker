// Startup payload guard (Oct 2026 performance pass). The app shell used to ship one 2.9 MB entry chunk (565 KB brotli) on every page, because exceljs,
// pdfjs-dist / tesseract.js and every page were imported eagerly. Now only the two landing pages (Dashboard, Projects) are in the entry chunk, and
// exceljs / the PDF extraction pipeline / every other page load the first time they are used. These checks keep it that way:
//   1. source-level: no eager imports of the heavy libraries, and the lazy page list in MainLayout is intact and still routed;
//   2. build-level: a real production build whose startup files (the ones index.html loads) stay under a gzip budget and never contain exceljs/pdfjs.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = (rel) => readFileSync(path.join(root, "src", rel), "utf8");
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = path.join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const sourceFiles = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));

test("exceljs is never imported eagerly: type-only imports and dynamic import() only", () => {
  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      if (/^\s*import\b[^;]*from\s+["']exceljs["']/.test(line) || /^\s*import\s+["']exceljs["']/.test(line)) {
        assert.match(line, /^\s*import\s+type\b/, `${path.relative(root, file)}: static value import of exceljs -> ${line.trim()}`);
      }
    }
  }
  assert.match(src("pages/Projects/Projects.tsx"), /await import\("exceljs"\)/);
  assert.match(src("pages/Projects/FinancialLossProjects.tsx"), /await import\("exceljs"\)/);
  assert.match(src("pages/Projects/TimesheetPendingProjects.tsx"), /await import\("exceljs"\)/);
  assert.match(src("services/projectWorkbookService.ts"), /await import\("exceljs"\)/);
});

test("the PDF extraction pipeline (pdfjs-dist, tesseract.js, the PDF worker) is reachable only through one dynamic import in pdfImportService", () => {
  for (const file of sourceFiles) {
    const rel = path.relative(path.join(root, "src"), file).replaceAll("\\", "/");
    if (rel.startsWith("services/pdfExtraction/")) continue; // the pipeline itself
    const text = readFileSync(file, "utf8");
    assert.ok(!/^\s*import\b[^;]*from\s+["'](pdfjs-dist[^"']*|tesseract\.js)["']/m.test(text), `${rel}: static import of pdfjs-dist / tesseract.js outside the lazy pipeline`);
    assert.ok(!/^\s*import\b[^;]*from\s+["'][./]*(?:services\/)?pdfExtraction(?:\/[^"']*)?["']/m.test(text), `${rel}: static import of the PDF extraction pipeline`);
  }
  assert.match(src("services/pdfImportService.ts"), /await import\("\.\/pdfExtraction"\)/);
});

test("MainLayout keeps only Dashboard and Projects eager; every other page is lazy() and still routed, inside one Suspense", () => {
  const layout = src("layouts/MainLayout.tsx");
  const eagerPages = [...layout.matchAll(/^import\s+(\w+)\s+from\s+"\.\.\/pages\/[^"]+";/gm)].map((m) => m[1]);
  assert.deepEqual(eagerPages.sort(), ["Dashboard", "Projects"].sort(), "only the landing pages are bundled with the shell");
  const lazyPages = [...layout.matchAll(/^const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\.\/pages\/[^"]+"\)\);/gm)].map((m) => m[1]);
  for (const name of ["CompletedProjects", "ArchivedProjects", "FinancialLossProjects", "TimelineAlertProjects", "TimesheetPendingProjects", "TeamLeadsWorkloadProjects", "AddProject", "ViewProject", "EditProject", "Notes", "CustomerMaster", "Manpower", "Timesheets", "ReportsPage", "Settings", "RequestPR", "PRRequests", "PRRequestDetail", "InvoiceTracker", "WeeklyEmailPreviewPage", "WeeklyEmailRunsPage"]) {
    assert.ok(lazyPages.includes(name), `${name} is lazy`);
    assert.match(layout, new RegExp(`<${name} />`), `${name} is still rendered by a route`);
  }
  assert.match(layout, /<Suspense fallback=\{pageFallback\}>\s*<Routes>/, "one Suspense boundary around every route");
});

test("a real production build: the startup files stay within the gzip budget and exceljs / pdfjs are separate on-demand chunks", { timeout: 240000 }, async () => {
  const { build } = await import("vite");
  const outDir = mkdtempSync(path.join(tmpdir(), "pmo-startup-"));
  try {
    await build({ root, logLevel: "silent", build: { outDir, emptyOutDir: true, reportCompressedSize: false } });
    const assets = readdirSync(path.join(outDir, "assets"));
    const html = readFileSync(path.join(outDir, "index.html"), "utf8");
    const startup = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    assert.ok(startup.length > 0, "index.html loads at least the entry chunk");
    let gzip = 0;
    for (const f of startup) {
      const body = readFileSync(path.join(outDir, f));
      gzip += gzipSync(body, { level: 9 }).length;
      assert.ok(!/exceljs|pdfjs|pdf\.worker|pdfExtraction|tesseract/i.test(f), `${f}: a heavy library chunk is in the startup set`);
    }
    // measured at 187 KB gzip after the change (was 743 KB); the budget leaves room for normal growth but fails on a regression to eager loading
    assert.ok(gzip < 300 * 1024, `startup JavaScript is ${Math.round(gzip / 1024)} KB gzip, budget 300 KB`);
    assert.ok(assets.some((f) => /^exceljs.*\.js$/.test(f)), "exceljs is its own chunk");
    assert.ok(assets.some((f) => /^pdfExtraction.*\.js$/.test(f)), "the PDF extraction pipeline is its own chunk");
    const startupSet = new Set(startup.map((s) => s.replace("assets/", "")));
    for (const f of assets.filter((n) => /^(exceljs|pdfExtraction|pdf\.worker)/.test(n))) assert.ok(!startupSet.has(f), `${f} must not be loaded at startup`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
