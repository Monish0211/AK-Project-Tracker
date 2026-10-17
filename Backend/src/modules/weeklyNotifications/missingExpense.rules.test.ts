import assert from "node:assert/strict";
import { test } from "node:test";
import cron from "node-cron";
import {
  buildMissingExpenseReport,
  DEFAULT_CC_EMAILS,
  DEFAULT_TO_EMAIL,
  formatReportTimestamp,
  isEligibleStatus,
  UNRESOLVED_DEFAULT_CC,
  validateRecipients,
  weeklyPeriodKey,
  type CandidateProject,
} from "./missingExpense.rules.js";
import { buildMissingOtherExpensesEmail } from "../../shared/email/templates/missingOtherExpenses.template.js";
import { env } from "../../shared/utils/env.js";

const EXCLUDED = ["On Hold", "Completed", "Cancelled"];
const ELIGIBLE = [
  "Not Started",
  "Ongoing",
  "Active",
  "Allotted to Tech team",
  "KoM Completed",
  "Data Request Shared",
  "On-going",
  "Draft Report Submitted",
  "Comments Received",
  "Updated Report Submitted",
  "Final Report Submitted",
];

test("each excluded status is excluded, including case / whitespace / hyphen variants", () => {
  for (const s of EXCLUDED) assert.equal(isEligibleStatus(s), false, s);
  for (const s of ["on hold", " ON HOLD ", "On  Hold", "on-hold", "On_Hold", "COMPLETED", " completed\t", "cancelled", "Canceled", "CANCELLED "]) {
    assert.equal(isEligibleStatus(s), false, JSON.stringify(s));
  }
});

test("every other dropdown status stays eligible — especially KoM Completed — in any case/spacing", () => {
  for (const s of ELIGIBLE) {
    assert.equal(isEligibleStatus(s), true, s);
    assert.equal(isEligibleStatus(`  ${s.toUpperCase()}  `), true, `upper ${s}`);
  }
  assert.equal(isEligibleStatus("kom completed"), true);
  assert.equal(isEligibleStatus("Completed Phase 1"), true, "only an exact excluded status is excluded");
  assert.equal(isEligibleStatus("On-going"), true);
  assert.equal(isEligibleStatus("Ongoing"), true);
  assert.equal(isEligibleStatus(""), true, "a blank status is not one of the excluded statuses");
});

function p(id: string, status: string, otherExpenseCount: number): CandidateProject {
  return { id, prNo: `PR-${id}`, client: "C", projectTitle: "T", projectManager: null, projectStatus: status, otherExpenseCount };
}

test("report: only eligible projects are counted; missing = zero Other Project Expenses records (count, never amount)", () => {
  const report = buildMissingExpenseReport([
    p("1", "Active", 0), // missing
    p("2", "KoM Completed", 0), // missing
    p("3", "Active", 1), // has a record (e.g. a zero-value row) → not missing
    p("4", "Completed", 0), // excluded
    p("5", "On Hold", 0), // excluded
    p("6", "cancelled", 0), // excluded
    p("7", "On-going", 3),
  ]);
  assert.equal(report.eligibleCount, 4);
  assert.deepEqual(report.missing.map((m) => m.id), ["1", "2"]);
});

test("report: missing list is sorted by PR No. (numeric-aware)", () => {
  const report = buildMissingExpenseReport([{ ...p("a", "Active", 0), prNo: "PR-10" }, { ...p("b", "Active", 0), prNo: "PR-9" }]);
  assert.deepEqual(report.missing.map((m) => m.prNo), ["PR-9", "PR-10"]);
});

test("recipients: valid list passes; invalid, duplicate and CC-equals-To are rejected; blanks ignored", () => {
  assert.deepEqual(validateRecipients({ toEmail: " info@ifluids.com ", ccEmails: ["a@ifluids.com", "  ", "b@ifluids.com"] }), {
    ok: true,
    toEmail: "info@ifluids.com",
    ccEmails: ["a@ifluids.com", "b@ifluids.com"],
  });
  assert.equal(validateRecipients({ toEmail: "", ccEmails: [] }).ok, false);
  assert.equal(validateRecipients({ toEmail: "not-an-email", ccEmails: [] }).ok, false);
  assert.equal(validateRecipients({ toEmail: "info@ifluids.com", ccEmails: ["bad@"] }).ok, false);
  const dup = validateRecipients({ toEmail: "info@ifluids.com", ccEmails: ["A@ifluids.com", "a@IFLUIDS.com"] });
  assert.equal(dup.ok, false);
  assert.match((dup as { message: string }).message, /more than once/);
  assert.equal(validateRecipients({ toEmail: "info@ifluids.com", ccEmails: ["INFO@ifluids.com"] }).ok, false, "CC repeating To");
});

test("defaults: To info@ifluids.com; CC only real user emails; Suresh left unresolved", () => {
  assert.equal(DEFAULT_TO_EMAIL, "info@ifluids.com");
  assert.deepEqual([...DEFAULT_CC_EMAILS], ["sivagnanam@ifluids.com", "monish.n@ifluids.com"]);
  assert.deepEqual([...UNRESOLVED_DEFAULT_CC], ["Suresh"]);
  assert.ok(validateRecipients({ toEmail: DEFAULT_TO_EMAIL, ccEmails: [...DEFAULT_CC_EMAILS] }).ok);
});

test("weekly schedule: default Monday 09:00 in Asia/Kolkata, valid cron expression", () => {
  assert.equal(env.MISSING_EXPENSE_CRON, "0 9 * * 1");
  assert.equal(env.APP_TIMEZONE, "Asia/Kolkata");
  assert.ok(cron.validate(env.MISSING_EXPENSE_CRON));
});

test("week key follows the configured timezone at the week boundary", () => {
  // Sun 18 Oct 2026 23:30 IST (= 18:00 UTC) is still ISO week 42 in Kolkata …
  assert.equal(weeklyPeriodKey(new Date("2026-10-18T18:00:00Z"), "Asia/Kolkata"), "2026-W42");
  // … and Mon 19 Oct 00:30 IST (= Sun 19:00 UTC) is week 43 in Kolkata but still week 42 in UTC.
  assert.equal(weeklyPeriodKey(new Date("2026-10-18T19:00:00Z"), "Asia/Kolkata"), "2026-W43");
  assert.equal(weeklyPeriodKey(new Date("2026-10-18T19:00:00Z"), "UTC"), "2026-W42");
  // Every tick in one local week maps to the same key; ISO year rollover.
  assert.equal(weeklyPeriodKey(new Date("2026-10-12T04:00:00Z"), "Asia/Kolkata"), weeklyPeriodKey(new Date("2026-10-16T12:00:00Z"), "Asia/Kolkata"));
  assert.equal(weeklyPeriodKey(new Date("2027-01-01T06:00:00Z"), "Asia/Kolkata"), "2026-W53");
});

test("report timestamp includes the timezone", () => {
  const s = formatReportTimestamp(new Date("2026-10-19T03:30:00Z"), "Asia/Kolkata");
  assert.match(s, /19 Oct 2026, 09:00/);
  assert.match(s, /IST|GMT\+5:30/);
  assert.match(s, /\(Asia\/Kolkata\)$/);
});

test("email: user data is HTML-escaped, links are used as given, plain text and scope note present", () => {
  const email = buildMissingOtherExpensesEmail({
    subject: "Weekly Report — Projects Missing Other Project Expenses",
    generatedAt: "19 Oct 2026, 09:00 IST (Asia/Kolkata)",
    eligibleCount: 12,
    projects: [
      {
        prNo: "PR-<1>",
        client: `<script>alert("x")</script> & Co`,
        projectTitle: "Tank's \"farm\"",
        projectManager: null,
        projectStatus: "KoM Completed",
        projectUrl: "https://pmodashboard.ifluids.in/projects/view/abc",
      },
    ],
  });
  assert.ok(!email.html.includes("<script>"), "no raw script tag");
  assert.ok(email.html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co"));
  assert.ok(email.html.includes("PR-&lt;1&gt;"));
  assert.ok(email.html.includes("Tank&#39;s &quot;farm&quot;"));
  assert.ok(email.html.includes('href="https://pmodashboard.ifluids.in/projects/view/abc"'));
  assert.ok(email.html.includes(">12<") && email.html.includes(">1<"), "both counts shown");
  assert.match(email.html, /Other Project Expenses only/);
  assert.match(email.html, /does not assess man-hour expenses/);
  assert.match(email.text, /PR-<1> \| <script>alert\("x"\)<\/script> & Co/);
  assert.match(email.text, /Eligible projects checked: 12/);
  assert.ok(email.html.includes("Projects missing Non-Man-Hour Expenses") && email.text.includes("Projects missing Non-Man-Hour Expenses: 1"), "summary label (renamed Oct 2026)");
  assert.equal(email.subject, "Weekly Report — Projects Missing Other Project Expenses");
});

test("email: empty state when nothing is missing", () => {
  const email = buildMissingOtherExpensesEmail({ subject: "S", generatedAt: "now", eligibleCount: 3, projects: [] });
  assert.match(email.html, /Every eligible project has at least one Other Project Expenses record/);
  assert.ok(!email.html.includes("<th"), "no table");
});

test("audit: manual runs share one key per 10-minute window (UTC), so near-simultaneous runs collide on the same lock", async () => {
  const { manualPeriodKey } = await import("./missingExpense.rules.js");
  assert.equal(manualPeriodKey(new Date("2026-10-17T10:20:00.000Z")), "manual:2026-10-17T10:20Z");
  assert.equal(manualPeriodKey(new Date("2026-10-17T10:29:59.999Z")), "manual:2026-10-17T10:20Z");
  assert.equal(manualPeriodKey(new Date("2026-10-17T10:30:00.000Z")), "manual:2026-10-17T10:30Z");
});

test("audit: week key across ISO year boundaries", () => {
  assert.equal(weeklyPeriodKey(new Date("2025-12-29T04:00:00Z"), "Asia/Kolkata"), "2026-W01", "Mon 29 Dec 2025 belongs to 2026-W01");
  assert.equal(weeklyPeriodKey(new Date("2027-01-04T04:00:00Z"), "Asia/Kolkata"), "2027-W01");
  assert.equal(weeklyPeriodKey(new Date("2026-12-31T19:00:00Z"), "Asia/Kolkata"), "2026-W53", "New Year's Day 00:30 IST is still 2026-W53");
});

test("audit: a stale RUNNING/SENDING row is shown as INTERRUPTED/DELIVERY_UNKNOWN, fresh ones unchanged", async () => {
  const { displayRunStatus } = await import("./missingExpense.rules.js");
  const now = new Date("2026-10-19T05:00:00Z");
  const old = new Date("2026-10-19T03:00:00Z");
  const fresh = new Date("2026-10-19T04:55:00Z");
  assert.equal(displayRunStatus("SENDING", old, now), "DELIVERY_UNKNOWN");
  assert.equal(displayRunStatus("RUNNING", old, now), "INTERRUPTED");
  assert.equal(displayRunStatus("SENDING", fresh, now), "SENDING");
  assert.equal(displayRunStatus("SENT", old, now), "SENT");
  assert.equal(displayRunStatus("FAILED", old, now), "FAILED");
});

test("audit: the weekly scheduler registers exactly one cron task per process, in APP_TIMEZONE", async () => {
  const { startMissingExpenseScheduler } = await import("../../shared/scheduler/missingExpenseScheduler.js");
  const before = new Set(cron.getTasks().keys());
  startMissingExpenseScheduler();
  startMissingExpenseScheduler(); // second call in the same process must be ignored
  const added = [...cron.getTasks().entries()].filter(([id]) => !before.has(id));
  try {
    assert.equal(added.length, 1);
  } finally {
    for (const [, task] of added) await task.destroy();
  }
});
