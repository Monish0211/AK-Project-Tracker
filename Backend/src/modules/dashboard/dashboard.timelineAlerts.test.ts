import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIVE_PROJECT_STATUSES, PROJECT_STATUS_VALUES } from "../projects/project.constants.js";
import type { DashboardProjectRow } from "./repository/dashboard.repository.js";
import { buildTimelineAlerts } from "./services/dashboard.service.js";

/**
 * Dashboard "Project Timeline Alerts" widget — summary counts (Oct 2026 fix). The widget used to count only projects whose status was the literal
 * "Active", while the Timeline Alert Repository page (frontend getProjectTimelineAlerts) counts every in-progress workflow stage, so production showed
 * 0 / 0 / 0 / 2 / 2 on the Dashboard against 5 / 4 / 0 / 11 / 45 in the Repository. These tests pin: (1) the same eligible population as the
 * Repository, (2) the category boundaries, (3) counts that cover the WHOLE eligible set rather than the ten rows the widget lists.
 * Pure: no database, no network. The calendar day is pinned through `now`, so the boundaries cannot flake around midnight.
 */

// Local noon on 28 Oct 2026 — calculateTimelineAlert works on the local calendar day, so this is "today" on any machine time zone.
const NOW = new Date(2026, 9, 28, 12, 0, 0);

/** Same ten statuses as frontend/src/constants/projectStatus.ts (ACTIVE_PROJECT_STATUSES) — the Repository page's eligibility. */
const REPOSITORY_ACTIVE_STATUSES = [
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

let seq = 0;
/** A project whose end date is `daysFromToday` calendar days away (negative = past), stored the way the database does: midnight UTC. */
function project(projectStatus: string, daysFromToday: number | null): DashboardProjectRow {
  seq += 1;
  return {
    id: `p${seq}`,
    prNo: `PR-${1000 + seq}`,
    client: "Client",
    department: "Process",
    projectTitle: `Project ${seq}`,
    projectStatus,
    projectStartDate: new Date(Date.UTC(2026, 0, 1)),
    projectEndDate: daysFromToday === null ? null : new Date(Date.UTC(2026, 9, 28 + daysFromToday)),
    createdAt: new Date(Date.UTC(2026, 0, 1)),
    updatedAt: new Date(Date.UTC(2026, 0, 1)),
    manhourBudgetHours: null,
    primaryProjectManager: null,
  };
}

const counts = (r: ReturnType<typeof buildTimelineAlerts>) => ({
  dueSoon: r.dueSoonCount,
  upcoming: r.upcomingCount,
  dueToday: r.dueTodayCount,
  onTrack: r.onTrackCount,
  overdue: r.overdueCount,
});

test("the production case: projects in later workflow stages are counted, not only the literal 'Active' ones (0/0/2/2 was shown instead of 5/4/11/45)", () => {
  const rows: DashboardProjectRow[] = [];
  // The four literal-Active projects the widget used to show: 2 On Track, 2 Overdue.
  rows.push(project("Active", 40), project("Active", 90), project("Active", -3), project("Active", -200));
  // 61 projects in other in-progress stages: 5 Due Soon, 4 Upcoming, 9 On Track, 43 Overdue.
  const stages = ["Ongoing", "Updated Report Submitted", "Draft Report Submitted", "Final Report Submitted", "Comments Received", "Allotted to Tech team", "KoM Completed", "Data Request Shared", "On-going"];
  let i = 0;
  const next = () => stages[i++ % stages.length]!;
  for (const d of [1, 3, 5, 6, 7]) rows.push(project(next(), d)); // Due Soon x5
  for (const d of [8, 10, 12, 14]) rows.push(project(next(), d)); // Upcoming x4
  for (let k = 0; k < 9; k++) rows.push(project(next(), 20 + k * 10)); // On Track x9
  for (let k = 0; k < 43; k++) rows.push(project(next(), -(k + 1))); // Overdue x43
  // Projects that must stay out: finished, stopped, not started, on hold, unknown, archived, and one with no end date.
  rows.push(project("Completed", -5), project("Cancelled", 3), project("Not Started", 9), project("On Hold", -9), project("In progress", 2), project("Archived", 4), project("Ongoing", null));

  const result = buildTimelineAlerts(rows, NOW);
  assert.deepEqual(counts(result), { dueSoon: 5, upcoming: 4, dueToday: 0, onTrack: 11, overdue: 45 });
  assert.equal(result.totalMatchingProjects, 65);
  assert.equal(result.top10.length, 10, "the widget still lists only its ten most urgent projects");
});

test("the counts cover the complete eligible set, not just the rows the widget lists: they add up to totalMatchingProjects whatever the list length", () => {
  const rows = [
    ...Array.from({ length: 12 }, (_, k) => project("Ongoing", -(k + 1))), // 12 Overdue
    ...Array.from({ length: 7 }, (_, k) => project("Draft Report Submitted", 30 + k)), // 7 On Track
    project("Updated Report Submitted", 0), // Due Today
    project("Comments Received", 4), // Due Soon
    project("Active", 11), // Upcoming
  ];
  const result = buildTimelineAlerts(rows, NOW);
  assert.deepEqual(counts(result), { dueSoon: 1, upcoming: 1, dueToday: 1, onTrack: 7, overdue: 12 });
  assert.equal(result.totalMatchingProjects, 22);
  assert.equal(result.dueSoonCount + result.upcomingCount + result.dueTodayCount + result.onTrackCount + result.overdueCount, result.totalMatchingProjects);
  assert.equal(result.top10.length, 10);
  assert.ok(result.totalMatchingProjects > result.top10.length, "the summary is about all eligible projects, the list is only the top ten");
});

test("eligibility is exactly the Repository's: every status in the workflow is counted if and only if it is one of the ten active-project statuses", () => {
  assert.deepEqual([...ACTIVE_PROJECT_STATUSES].sort(), [...REPOSITORY_ACTIVE_STATUSES].sort(), "backend ACTIVE_PROJECT_STATUSES still equals the frontend/Repository list");
  for (const status of [...PROJECT_STATUS_VALUES, "Archived", "Delayed", "In progress", "", "active"]) {
    const r = buildTimelineAlerts([project(status, 30)], NOW);
    const expected = REPOSITORY_ACTIVE_STATUSES.includes(status) ? 1 : 0;
    assert.equal(r.totalMatchingProjects, expected, `status "${status}"`);
    assert.equal(r.onTrackCount, expected, `status "${status}" (On Track)`);
  }
});

test("category boundaries (end date vs today): past = Overdue, today = Due Today, 1-7 days = Due Soon, 8-14 = Upcoming, 15+ = On Track", () => {
  const table: [number, "overdue" | "dueToday" | "dueSoon" | "upcoming" | "onTrack"][] = [
    [-30, "overdue"],
    [-1, "overdue"],
    [0, "dueToday"],
    [1, "dueSoon"],
    [7, "dueSoon"],
    [8, "upcoming"],
    [14, "upcoming"],
    [15, "onTrack"],
    [365, "onTrack"],
  ];
  for (const [days, category] of table) {
    const c = counts(buildTimelineAlerts([project("Ongoing", days)], NOW));
    assert.equal(c[category], 1, `${days} day(s) from today should be ${category}`);
    assert.equal(Object.values(c).reduce((a, b) => a + b, 0), 1, `${days} day(s): exactly one category`);
  }
});

test("a project with no end date is never counted, and an empty list gives all zeros", () => {
  assert.deepEqual(counts(buildTimelineAlerts([project("Ongoing", null), project("Active", null)], NOW)), { dueSoon: 0, upcoming: 0, dueToday: 0, onTrack: 0, overdue: 0 });
  const empty = buildTimelineAlerts([], NOW);
  assert.equal(empty.totalMatchingProjects, 0);
  assert.deepEqual(empty.top10, []);
});

test("the listed projects keep their order (Due Today, Due Soon, Upcoming, On Track, Overdue; soonest first) and carry the same status the counts use", () => {
  const rows = [project("Ongoing", -2), project("Ongoing", 30), project("Ongoing", 12), project("Ongoing", 3), project("Ongoing", 0), project("Ongoing", 1)];
  const { top10 } = buildTimelineAlerts(rows, NOW);
  assert.deepEqual(top10.map((p) => p.status), ["Due Today", "Due Soon", "Due Soon", "Upcoming", "On Track", "Overdue"]);
  assert.deepEqual(top10.map((p) => p.daysRemaining), [0, 1, 3, 12, 30, -2]);
});
