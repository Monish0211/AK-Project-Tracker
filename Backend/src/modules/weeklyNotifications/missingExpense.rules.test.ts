import assert from "node:assert/strict";
import { test } from "node:test";
import cron from "node-cron";
import {
  buildMissingExpenseReport,
  DEFAULT_CC_EMAILS,
  DEFAULT_TO_EMAIL,
  formatReportTimestamp,
  hasNonManhourBudgetEntered,
  isEligibleStatus,
  UNRESOLVED_DEFAULT_CC,
  validateRecipients,
  weeklyPeriodKey,
  type CandidateProject,
} from "./missingExpense.rules.js";
import { buildMissingOtherExpensesEmail } from "../../shared/email/templates/missingOtherExpenses.template.js";
import { env } from "../../shared/utils/env.js";

const EXCLUDED = ["Not Started", "On Hold", "Completed", "Cancelled"];
const ELIGIBLE = [
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
  for (const s of ["not started", " NOT STARTED ", "Not  Started", "not-started", "Not_Started", "on hold", " ON HOLD ", "On  Hold", "on-hold", "On_Hold", "COMPLETED", " completed\t", "cancelled", "Canceled", "CANCELLED "]) {
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
  assert.equal(isEligibleStatus("Started"), true);
  assert.equal(isEligibleStatus("Not Started Yet"), true, "only an exact Not Started is excluded");
  assert.equal(isEligibleStatus("On-going"), true);
  assert.equal(isEligibleStatus("Ongoing"), true);
  assert.equal(isEligibleStatus(""), true, "a blank status is not one of the excluded statuses");
});

function p(id: string, status: string, otherExpenseCount: number, nonManhourBudgetAmount: number | null = 0): CandidateProject {
  return { id, prNo: `PR-${id}`, client: "C", projectTitle: "T", projectManager: null, projectStatus: status, nonManhourBudgetAmount, otherExpenseCount };
}

test("report: only eligible projects are counted; missing = zero Other Project Expenses records (count, never amount)", () => {
  const report = buildMissingExpenseReport([
    p("1", "Active", 0), // missing
    p("2", "KoM Completed", 0), // missing
    p("3", "Active", 1), // has a record (e.g. a zero-value row) → not missing
    p("4", "Completed", 0), // excluded
    p("5", "On Hold", 0), // excluded
    p("6", "cancelled", 0), // excluded
    p("8", "Not Started", 0), // excluded (Oct 2026)
    p("9", "not-started", 0), // excluded — normalized
    p("7", "On-going", 3),
  ]);
  assert.equal(report.eligibleCount, 4, "Not Started is not counted as eligible");
  assert.deepEqual(report.missing.map((m) => m.id), ["1", "2"], "nor listed as missing");
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
  assert.match(email.html, /Non Man-Hour Budget Amount entered in Expense Budget/);
  assert.match(email.html, /does not assess man-hour expenses/);
  assert.match(email.text, /PR-<1> \| <script>alert\("x"\)<\/script> & Co/);
  assert.match(email.text, /Eligible projects checked: 12/);
  assert.ok(email.html.includes("Projects missing Non-Man-Hour Expenses") && email.text.includes("Projects missing Non-Man-Hour Expenses: 1"), "summary label (renamed Oct 2026)");
  assert.equal(email.subject, "Weekly Report — Projects Missing Other Project Expenses");
});

test("email: empty state when nothing is missing", () => {
  const email = buildMissingOtherExpensesEmail({ subject: "S", generatedAt: "now", eligibleCount: 3, projects: [] });
  assert.match(email.html, /Every project with a Non Man-Hour Budget Amount entered has at least one Other Project Expenses record/);
  assert.ok(!email.html.includes("<th"), "no table");
  assert.ok(!email.html.includes("Please enter the applicable actual expenses"), "no request when there is nothing to enter");
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

// ── Phase 2 (Oct 2026): a Non Man-Hour Budget Amount must have been entered ─────────────────────────────────────────────────────────────────

const ids = (projects: CandidateProject[]) => buildMissingExpenseReport(projects).missing.map((m) => m.id);

test("budget rule: the full eligibility table (status eligible)", () => {
  const cases: Array<[string, number | null, number, boolean]> = [
    ["NULL + no expenses", null, 0, false],
    ["0 + no expenses", 0, 0, true],
    ["62,500 + no expenses", 62500, 0, true],
    ["0.01 + no expenses", 0.01, 0, true],
    ["NULL + expenses", null, 2, false],
    ["0 + expenses", 0, 2, false],
    ["62,500 + expenses", 62500, 2, false],
  ];
  for (const [label, budget, expenses, included] of cases) {
    assert.equal(ids([p("x", "Active", expenses, budget)]).length === 1, included, label);
  }
});

test("budget rule: an explicit 0 is an ENTERED budget - the check is a null check, never a truthy check", () => {
  assert.equal(hasNonManhourBudgetEntered(0), true);
  assert.equal(hasNonManhourBudgetEntered(62500), true);
  assert.equal(hasNonManhourBudgetEntered(null), false);
  assert.equal(hasNonManhourBudgetEntered(undefined), false);
  assert.deepEqual(ids([p("zero", "Active", 0, 0), p("none", "Active", 0, null)]), ["zero"]);
});

test("budget rule: every existing excluded status stays excluded, whatever the budget", () => {
  for (const status of EXCLUDED) {
    for (const budget of [0, 62500, null]) {
      const report = buildMissingExpenseReport([p("s", status, 0, budget)]);
      assert.equal(report.missing.length, 0, `${status} / ${budget}`);
      assert.equal(report.eligibleCount, 0, `${status} / ${budget} is not evaluated either`);
    }
  }
  assert.deepEqual(ids([p("k", "KoM Completed", 0, 0)]), ["k"], "KoM Completed stays eligible");
});

test("budget rule: eligibleCount is only the projects with an entered budget that pass the status rules", () => {
  const report = buildMissingExpenseReport([
    p("1", "Active", 0, 0), // evaluated, missing
    p("2", "Active", 5, 62500), // evaluated, has expenses
    p("3", "Active", 0, null), // no budget entered: not evaluated
    p("4", "Active", 4, null), // no budget entered: not evaluated
    p("5", "Completed", 0, 100), // excluded status
    p("6", "On-going", 0, 1000), // evaluated, missing
  ]);
  assert.equal(report.eligibleCount, 3);
  assert.deepEqual(report.missing.map((m) => m.id), ["1", "6"]);
});

test("budget rule: nothing qualifying gives an empty list (so the job sends no email)", () => {
  const report = buildMissingExpenseReport([p("1", "Active", 0, null), p("2", "Active", 3, 0), p("3", "Completed", 0, 0)]);
  assert.equal(report.missing.length, 0);
  assert.equal(report.eligibleCount, 1);
});

test("email wording (Phase 2): says Non Man-Hour Budget, asks for actual expenses, and no longer claims Expense Budget is ignored", () => {
  const full = buildMissingOtherExpensesEmail({
    subject: "S",
    generatedAt: "now",
    eligibleCount: 4,
    projects: [{ prNo: "PR-1", client: "C", projectTitle: "T", projectManager: null, projectStatus: "Active", projectUrl: "https://example.test/p" }],
  });
  for (const body of [full.html, full.text]) {
    assert.match(body, /Non Man-Hour Budget/);
    assert.match(body, /planned Non Man-Hour Budget but no Other Project Expenses recorded/);
    assert.match(body, /Please enter the applicable actual expenses/);
    assert.match(body, /₹0 counts as entered/);
    assert.doesNotMatch(body, /does not assess[^.]*Expense Budget/i, "must not claim Expense Budget is not assessed");
    assert.doesNotMatch(body, /man-hour expenses, Expense Budget/i);
    assert.match(body, /does not assess man-hour expenses, timesheets or invoices/, "man-hour, timesheets and invoices are still out of scope");
  }
  assert.match(full.text, /Eligible projects checked: 4/, "existing summary line unchanged");
  assert.match(full.html, /Excluded statuses: Not Started, On Hold, Completed, Cancelled/, "existing status note unchanged");
  const empty = buildMissingOtherExpensesEmail({ subject: "S", generatedAt: "now", eligibleCount: 2, projects: [] });
  assert.doesNotMatch(empty.html + empty.text, /Expense Budget, timesheets/);
});
