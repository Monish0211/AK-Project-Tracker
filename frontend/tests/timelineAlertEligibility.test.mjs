// Timeline Alerts (Oct 2026) — the Dashboard widget's summary counts are computed by the backend (buildTimelineAlerts) and the Timeline Alert
// Repository page's counts by the frontend (getProjectTimelineAlerts). They only agree while both use the SAME eligible statuses and the SAME
// category boundaries, so this file pins the frontend half of that contract to the same explicit lists the backend test
// (Backend/src/modules/dashboard/dashboard.timelineAlerts.test.ts) pins its half to. Change one side and the other test fails.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

// Identical to REPOSITORY_ACTIVE_STATUSES in the backend test.
const ACTIVE_STATUSES = [
  "Active",
  "Ongoing",
  "On-going",
  "Allotted to Tech team",
  "KoM Completed",
  "Data Request Shared",
  "Draft Report Submitted",
  "Comments Received",
  "Updated Report Submitted",
  "Final Report Submitted",
];

test("the Repository's eligible project statuses are exactly the ten in-progress stages the Dashboard widget also counts", async () => {
  const { ACTIVE_PROJECT_STATUSES, isActiveProjectStatus } = await load("/src/constants/projectStatus.ts");
  assert.deepEqual([...ACTIVE_PROJECT_STATUSES].sort(), [...ACTIVE_STATUSES].sort());
  for (const status of ACTIVE_STATUSES) assert.equal(isActiveProjectStatus(status), true, status);
  for (const status of ["Not Started", "On Hold", "Completed", "Cancelled", "Archived", "In progress", "active", "", null, undefined]) {
    assert.equal(isActiveProjectStatus(status), false, String(status));
  }
});

test("the Repository page counts every in-progress stage (isActiveProjectStatus), never only the literal 'Active' status", () => {
  const service = src("services/dashboardService.ts");
  assert.match(service, /getProjects\(\)\.filter\(\(project\) => isActiveProjectStatus\(project\.projectStatus\)\)/);
  const body = service.slice(service.indexOf("export const getProjectTimelineAlerts"), service.indexOf("export const getProjectsWithDurationOverrun"));
  assert.ok(!/projectStatus\s*[!=]==\s*"Active"/.test(body), "no literal Active comparison in the Timeline Alerts calculation");
});

test("the Repository's category boundaries are the Dashboard's: Overdue < 0, Due Today = 0, Due Soon 1-7, Upcoming 8-14, On Track 15+", () => {
  const service = src("services/dashboardService.ts");
  const fn = service.slice(service.indexOf("export const calculateTimelineAlert"), service.indexOf("export const getProjectTimelineAlerts"));
  // In evaluation order, each threshold followed by the status it produces.
  const steps = [
    [/if \(daysRemaining < 0\)[\s\S]*?status: "Overdue"/, "Overdue"],
    [/if \(daysRemaining === 0\)[\s\S]*?status: "Due Today"/, "Due Today"],
    [/if \(daysRemaining <= 7\)[\s\S]*?status: "Due Soon"/, "Due Soon"],
    [/if \(daysRemaining <= 14\)[\s\S]*?status: "Upcoming"/, "Upcoming"],
    [/status: "On Track"/, "On Track"], // the fall-through: everything more than 14 days away
  ];
  let from = 0;
  for (const [pattern, name] of steps) {
    const rest = fn.slice(from);
    const m = pattern.exec(rest);
    assert.ok(m, `${name} threshold present and in order`);
    from += m.index + m[0].length;
  }
});
