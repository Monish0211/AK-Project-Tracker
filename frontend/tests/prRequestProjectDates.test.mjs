// PR Request approval: Project Start Date / Project End Date must be visible to Accounts and the PMO Manager.
// Root cause: the backend returns each stored date as an ISO timestamp ("2026-11-11T00:00:00.000Z"); the review form's <input type="date"> only accepts "YYYY-MM-DD" and shows a timestamp as an
// EMPTY box, and the read-only detail page printed the start date raw and had no end date at all. These tests pin the mapping, the helper, the display and the wiring.
//
// Run: node --test --test-concurrency=1 --test-timeout=240000 tests/prRequestProjectDates.test.mjs
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
    plugins: [
      {
        name: "stub-notification-service",
        enforce: "pre",
        load(id) {
          return id.split("\\").join("/").endsWith("/src/notifications/notificationService.ts") ? "export const notificationService = new Proxy({}, { get: () => () => undefined });" : null;
        },
      },
    ],
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

// a stored PR Request payload as the backend returns it today
const stored = (over = {}) => ({
  poMonth: "2026-11", prCategory: "India", prNo: "PR-1", rfqNo: "RFQ-1", client: "C", department: "PMO", domesticForeign: "Domestic", projectTitle: "T", workOrderStatus: "Received",
  projectStartDate: "2026-11-11T00:00:00.000Z", projectEndDate: "2027-11-10T00:00:00.000Z", projectStatus: "Not Started", workOrderNumber: "WO", workOrderDate: "2026-11-01T00:00:00.000Z",
  eicName: "E", contractType: "LUMP SUM", pmoCoordinator: "P", paymentType: "Milestone", gstApplicable: false, currency: "INR", currentExchangeRate: 1, contractExchangeRate: 1,
  quantityItems: [], paymentMilestones: [], ...over,
});

test("toDateOnly: an ISO timestamp becomes the YYYY-MM-DD a date input needs; a missing or invalid date stays EMPTY (never today)", async () => {
  const { toDateOnly } = await load("/src/utils/dateOnly.ts");
  assert.equal(toDateOnly("2026-11-11T00:00:00.000Z"), "2026-11-11");
  assert.equal(toDateOnly("2027-11-10T00:00:00.000Z"), "2027-11-10");
  assert.equal(toDateOnly("2026-11-11"), "2026-11-11", "a date-only value is unchanged");
  assert.equal(toDateOnly("2026-11-11 00:00:00"), "2026-11-11");
  assert.equal(toDateOnly("2026-11-11T23:59:59.999+05:30"), "2026-11-11", "the calendar day as written, not converted");
  for (const empty of [null, undefined, "", "   ", "not a date", "11/11/2026", "2026-1-1", "20261111", 5, {}]) assert.equal(toDateOnly(empty), "", `${String(empty)} stays empty`);
  const today = new Date().toISOString().slice(0, 10);
  assert.notEqual(toDateOnly(undefined), today);
});

test("formatDateOnly: written the PMO way (11 Nov 2026), '—' when there is no date, and the day never moves with the viewer's timezone", async () => {
  const { formatDateOnly } = await load("/src/utils/dateOnly.ts");
  const cases = [
    ["2026-11-11T00:00:00.000Z", "11 Nov 2026"], ["2027-11-10T00:00:00.000Z", "10 Nov 2027"], ["2026-12-31T00:00:00.000Z", "31 Dec 2026"], ["2027-01-01T00:00:00.000Z", "01 Jan 2027"],
    ["2028-02-29T00:00:00.000Z", "29 Feb 2028"], ["2026-01-31", "31 Jan 2026"], ["2026-06-05T00:00:00.000Z", "05 Jun 2026"],
  ];
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata", "Pacific/Pago_Pago"]) {
      process.env.TZ = tz;
      for (const [input, expected] of cases) assert.equal(formatDateOnly(input), expected, `${input} in ${tz}`);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
  for (const empty of [null, undefined, "", "garbage", "2026-13-40T00:00:00Z"]) assert.equal(formatDateOnly(empty), "\u2014", `${String(empty)}`);
  const text = src("utils/dateOnly.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/new Date\(|getDate\(|getMonth\(|getFullYear\(|toLocale|getTimezoneOffset/.test(text), "no Date object and no local getter is used: there is no timezone arithmetic to go wrong");
});

test("REVIEW FORM mapping: the stored ISO dates fill the form as YYYY-MM-DD (the root-cause fix) - both dates, every valid range", async () => {
  const { draftPayloadToProject } = await load("/src/pages/PRRequests/draftMapping.ts");
  const base = (await load("/src/utils/createEmptyProject.ts")).createEmptyProject();
  const p = draftPayloadToProject(base, stored());
  assert.equal(p.projectStartDate, "2026-11-11");
  assert.equal(p.projectEndDate, "2027-11-10");
  for (const [s, e] of [["2026-12-31T00:00:00.000Z", "2027-01-01T00:00:00.000Z"], ["2028-02-29T00:00:00.000Z", "2028-03-01T00:00:00.000Z"], ["2026-01-31T00:00:00.000Z", "2026-02-28T00:00:00.000Z"]]) {
    const q = draftPayloadToProject(base, stored({ projectStartDate: s, projectEndDate: e }));
    assert.equal(q.projectStartDate, s.slice(0, 10));
    assert.equal(q.projectEndDate, e.slice(0, 10));
  }
});

test("REVIEW FORM mapping: older / date-only payloads, a missing end date and a missing start date are handled without inventing anything", async () => {
  const { draftPayloadToProject } = await load("/src/pages/PRRequests/draftMapping.ts");
  const base = (await load("/src/utils/createEmptyProject.ts")).createEmptyProject();
  assert.equal(draftPayloadToProject(base, stored({ projectStartDate: "2026-11-11", projectEndDate: "2027-11-10" })).projectStartDate, "2026-11-11", "an already date-only value is unchanged");
  assert.equal(draftPayloadToProject(base, stored({ projectEndDate: null })).projectEndDate, "", "no end date -> blank, not today and not the approval date");
  assert.equal(draftPayloadToProject(base, stored({ projectEndDate: undefined })).projectEndDate, "");
  const missingStart = draftPayloadToProject(base, stored({ projectStartDate: undefined }));
  assert.equal(missingStart.projectStartDate, "", "a missing start date stays blank");
  assert.notEqual(missingStart.projectStartDate, new Date().toISOString().slice(0, 10));
});

test("ROUND TRIP: what the approver saves back is the same date-only value (a Save on the review form no longer wipes or changes the dates)", async () => {
  const { draftPayloadToProject, projectToDraftPayload } = await load("/src/pages/PRRequests/draftMapping.ts");
  const base = (await load("/src/utils/createEmptyProject.ts")).createEmptyProject();
  const form = draftPayloadToProject(base, stored());
  const payload = projectToDraftPayload(form);
  assert.equal(payload.projectStartDate, "2026-11-11");
  assert.equal(payload.projectEndDate, "2027-11-10");
  const noEnd = projectToDraftPayload(draftPayloadToProject(base, stored({ projectEndDate: null })));
  assert.equal(noEnd.projectEndDate, null, "an empty end date goes back as null, as the create form sends it");
});

test("READ-ONLY DETAIL: the Project Timeline shows both dates, formatted, with '—' for a date that was not entered - never an ISO timestamp", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProjectTimeline } = await load("/src/pages/PRRequests/ProjectTimeline.tsx");
  const both = renderToStaticMarkup(React.createElement(ProjectTimeline, { start: "2026-11-11T00:00:00.000Z", end: "2027-11-10T00:00:00.000Z" }));
  assert.ok(both.includes("Project Timeline") && both.includes("Project Start Date") && both.includes("Project End Date"));
  assert.ok(/data-testid="pr-project-start-date"[^>]*>11 Nov 2026</.test(both));
  assert.ok(/data-testid="pr-project-end-date"[^>]*>10 Nov 2027</.test(both));
  assert.ok(!both.includes("T00:00:00"), "no raw timestamp is shown");
  const noEnd = renderToStaticMarkup(React.createElement(ProjectTimeline, { start: "2026-06-15T00:00:00.000Z", end: null }));
  assert.ok(/pr-project-start-date"[^>]*>15 Jun 2026</.test(noEnd));
  assert.ok(/pr-project-end-date"[^>]*>\u2014</.test(noEnd), "no end date -> a dash");
});

test("WIRING: the detail page uses the timeline component (the raw start-date row is gone), the approvers' form is filled by the fixed mapping, and no approval logic was touched", () => {
  const detail = src("pages/PRRequests/PRRequestDetail.tsx");
  assert.ok(/<ProjectTimeline start=\{request\.projectData\.projectStartDate\} end=\{request\.projectData\.projectEndDate\} \/>/.test(detail));
  assert.ok(!/\["projectStartDate", "Project Start Date"\]/.test(detail), "the start date is no longer printed raw in the generic field list");
  const requestPr = src("pages/PRRequests/RequestPR.tsx");
  assert.ok(/draftPayloadToProject\(prev, detail\.projectData\)/.test(requestPr), "Accounts and PMO Manager review forms are filled through draftPayloadToProject");
  assert.ok(/toDateOnly\(data\.projectStartDate\)/.test(src("pages/PRRequests/draftMapping.ts")) && /toDateOnly\(data\.projectEndDate\)/.test(src("pages/PRRequests/draftMapping.ts")));
  // the approval flow itself is untouched: same calls, same stage rules
  assert.ok(/canActOnAccountsStage = request\.status === "Pending Accounts Approval" && request\.assignedAccountsApproverId === user\?\.id/.test(detail));
  assert.ok(/canActOnPmoStage = request\.status === "Pending PMO Manager Approval" && request\.assignedPmoManagerId === user\?\.id/.test(detail));
  assert.ok(/accountsApprovePRRequest\(id\)/.test(detail) && /pmoManagerApprovePRRequest\(id\)/.test(detail) && /rejectPRRequest\(id, rejectReason\.trim\(\)\)/.test(detail));
});

// ---- Work Order Date and milestone Due Dates: the same ISO-into-a-date-input defect, fixed with the same helper ----
const storedMilestone = (dueDate, name = "M") => ({ milestoneName: name, paymentPercentage: 50, dueDate });

test("WORK ORDER DATE (review form): the stored ISO value fills the date input as YYYY-MM-DD; a missing one stays blank, never today", async () => {
  const { draftPayloadToProject } = await load("/src/pages/PRRequests/draftMapping.ts");
  const base = (await load("/src/utils/createEmptyProject.ts")).createEmptyProject();
  assert.equal(draftPayloadToProject(base, stored({ workOrderDate: "2026-11-01T00:00:00.000Z" })).workOrderDate, "2026-11-01");
  assert.equal(draftPayloadToProject(base, stored({ workOrderDate: "2026-11-01" })).workOrderDate, "2026-11-01", "an already date-only value is unchanged");
  for (const missing of ["", null, undefined]) {
    const wo = draftPayloadToProject(base, stored({ workOrderDate: missing })).workOrderDate;
    assert.equal(wo, "", `${String(missing)} stays blank`);
    assert.notEqual(wo, new Date().toISOString().slice(0, 10));
  }
  for (const d of ["2028-02-29", "2026-01-31", "2026-12-31", "2027-01-01", "2026-06-05"]) {
    assert.equal(draftPayloadToProject(base, stored({ workOrderDate: `${d}T00:00:00.000Z` })).workOrderDate, d, d);
  }
});

test("WORK ORDER DATE + MILESTONES: the mapping gives the same answer in every timezone (no Date arithmetic, so no off-by-one day)", async () => {
  const { draftPayloadToProject } = await load("/src/pages/PRRequests/draftMapping.ts");
  const base = (await load("/src/utils/createEmptyProject.ts")).createEmptyProject();
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata", "Pacific/Pago_Pago"]) {
      process.env.TZ = tz;
      const p = draftPayloadToProject(base, stored({ workOrderDate: "2028-02-29T00:00:00.000Z", paymentMilestones: [storedMilestone("2026-12-31T00:00:00.000Z")] }));
      assert.equal(p.workOrderDate, "2028-02-29", tz);
      assert.equal(p.paymentMilestones[0].dueDate, "2026-12-31", tz);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test("MILESTONE DUE DATES (review form): each stored ISO due date fills its date input as YYYY-MM-DD; none stays blank", async () => {
  const { draftPayloadToProject } = await load("/src/pages/PRRequests/draftMapping.ts");
  const base = (await load("/src/utils/createEmptyProject.ts")).createEmptyProject();
  const p = draftPayloadToProject(base, stored({
    paymentMilestones: [storedMilestone("2026-12-15T00:00:00.000Z", "A"), storedMilestone("2027-01-31T00:00:00.000Z", "B"), storedMilestone("2028-02-29T00:00:00.000Z", "C"), storedMilestone("2027-03-10", "D"), storedMilestone(null, "E"), storedMilestone(undefined, "F")],
  }));
  assert.deepEqual(p.paymentMilestones.map((m) => m.dueDate), ["2026-12-15", "2027-01-31", "2028-02-29", "2027-03-10", "", ""]);
  assert.deepEqual(p.paymentMilestones.map((m) => m.milestoneName), ["A", "B", "C", "D", "E", "F"], "names are not touched");
  assert.deepEqual(p.paymentMilestones.map((m) => m.paymentPercentage), [50, 50, 50, 50, 50, 50], "percentages are not touched");
});

test("ROUND TRIP: saving the review form sends the SAME Work Order Date and milestone due dates back; a missing milestone date goes back as null", async () => {
  const { draftPayloadToProject, projectToDraftPayload } = await load("/src/pages/PRRequests/draftMapping.ts");
  const base = (await load("/src/utils/createEmptyProject.ts")).createEmptyProject();
  const form = draftPayloadToProject(base, stored({ workOrderDate: "2026-11-01T00:00:00.000Z", paymentMilestones: [storedMilestone("2026-12-15T00:00:00.000Z", "A"), storedMilestone(null, "B")] }));
  const payload = projectToDraftPayload(form);
  assert.equal(payload.workOrderDate, "2026-11-01");
  assert.deepEqual(payload.paymentMilestones.map((m) => m.dueDate), ["2026-12-15", null]);
  // reload: what the backend would return for that payload (stored at UTC midnight) maps back to the same form value
  const reloaded = draftPayloadToProject(base, { ...payload, workOrderDate: `${payload.workOrderDate}T00:00:00.000Z`, paymentMilestones: payload.paymentMilestones.map((m) => ({ ...m, dueDate: m.dueDate ? `${m.dueDate}T00:00:00.000Z` : m.dueDate })) });
  assert.equal(reloaded.workOrderDate, "2026-11-01");
  assert.deepEqual(reloaded.paymentMilestones.map((m) => m.dueDate), ["2026-12-15", ""]);
});

test("READ-ONLY DETAIL: Work Order Date is written the PMO way ('01 Nov 2026'), '—' when absent, never a raw ISO timestamp; wiring uses the existing helper", () => {
  const detail = src("pages/PRRequests/PRRequestDetail.tsx");
  assert.ok(/import \{ formatDateOnly \} from "\.\.\/\.\.\/utils\/dateOnly"/.test(detail), "the existing date-only helper is reused");
  assert.ok(/DATE_FIELD_KEYS[^;]*"workOrderDate"/.test(detail), "Work Order Date is listed as a date field");
  assert.ok(/DATE_FIELD_KEYS\.has\(key\) \? formatDateOnly\(/.test(detail), "date fields go through formatDateOnly");
  assert.ok(/String\(\(request\.projectData as unknown as Record<string, unknown>\)\[key\] \?\? "—"\)/.test(detail), "every other field is still printed exactly as before");
});

test("NO second date utility was introduced, and no approval/financial/milestone-rule code was touched", () => {
  const mapping = src("pages/PRRequests/draftMapping.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(/toDateOnly\(data\.workOrderDate\)/.test(mapping) && /toDateOnly\(m\.dueDate\)/.test(mapping));
  assert.ok(!/new Date\(|\.slice\(0, ?10\)|getTimezoneOffset/.test(mapping), "no ad-hoc date conversion in the mapping");
  const milestoneCard = src("pages/Projects/components/PaymentMilestoneCard.tsx");
  assert.ok(/value=\{milestone\.dueDate\}/.test(milestoneCard) && /value=\{singleMilestone\?\.dueDate \?\? ""\}/.test(milestoneCard), "the shared milestone card is untouched (it is also the Add Project form)");
});
