// Developer-facing helper text must not appear in the user interface (Oct 2026). Two lines that described how the screens are wired — not anything a
// PMO user needs — were visible in production: under "Quick Summary" in the sidebar, and next to "View All" in the dashboard's PMO Alerts widget.
// These checks keep them out, and keep the controls around them intact. Source-level, like the other layout tests in this folder.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

test("sidebar Quick Summary no longer shows the 'Projects API (not Dashboard KPIs)' line, and still shows its title and the four status rows", () => {
  const sidebar = src("components/Sidebar/Sidebar.tsx");
  assert.ok(!sidebar.includes("Project status counts from the Projects API"));
  assert.ok(!sidebar.includes("not Dashboard KPIs"));
  assert.match(sidebar, />\s*Quick Summary\s*</);
  for (const label of ["Active Projects", "On Hold", "Completed", "Cancelled"]) assert.ok(sidebar.includes(label), `Quick Summary row "${label}" is still there`);
});

test("PMO Alerts widget no longer shows 'Notification engine (separate from GET /dashboard/summary)', and View All still goes to Reports, right-aligned", () => {
  const widget = src("pages/Dashboard/components/PMOAlertsWidget.tsx");
  assert.ok(!widget.includes("Notification engine (separate from"));
  assert.ok(!widget.includes("GET /dashboard/summary"));
  assert.match(widget, /onClick=\{\(\) => navigate\("\/reports"\)\}/);
  assert.match(widget, /<span>View All<\/span>/);
  assert.match(widget, /cursor-pointer ml-auto"/, "with the text gone, View All stays pushed to the right edge");
});

test("no user-visible text anywhere in the app names an API route or the Dashboard summary endpoint", () => {
  const files = [
    "components/Sidebar/Sidebar.tsx",
    "pages/Dashboard/components/PMOAlertsWidget.tsx",
    "pages/Dashboard/components/ProjectsInLossTimeWidget.tsx",
    "pages/Dashboard/components/TeamLeadsWorkloadWidget.tsx",
  ];
  for (const file of files) {
    const text = src(file)
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/^\s*\/\/.*$/gm, ""); // line comments
    assert.ok(!/GET \/dashboard|Projects API|\(not Dashboard KPIs\)/.test(text), `${file}: no API wording in what the user reads`);
  }
});
