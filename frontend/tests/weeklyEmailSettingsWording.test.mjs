// Settings -> Weekly Emails wording for "Projects Missing Other Project Expenses" (Phase 2, Oct 2026): it must describe the same rule as the backend -
// a project is checked only when a Non Man-Hour Budget Amount was entered (0 counts), and listed only when it has no Other Project Expenses records.
// Text-only guard: the rule itself is tested in Backend/src/modules/weeklyNotifications. The unpaid-invoices entry must stay untouched.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("../src/pages/Settings/components/weeklyEmails/weeklyEmailNotifications.ts", import.meta.url), "utf8");
const section = (slug) => {
  const start = src.indexOf(`slug: "${slug}"`);
  assert.ok(start >= 0, slug);
  const next = src.indexOf("slug:", start + 10);
  return src.slice(start, next === -1 ? undefined : next);
};

test("other-expenses entry: subtitle states the budget condition, the zero case, and the unchanged status exclusions", () => {
  const s = section("other-expenses");
  assert.match(s, /with a Non Man-Hour Budget entered \(₹0 counts\)/);
  assert.match(s, /except Not Started, On Hold, Completed and Cancelled/);
  assert.match(s, /and no Other Project Expenses\./);
  assert.doesNotMatch(s, /Sent only when at least one project is missing\./, "old wording replaced");
});

test("other-expenses entry: the subtitle is no longer than the original, because the Settings card header shows it on ONE truncated line", () => {
  const subtitle = section("other-expenses").match(/subtitle: "([^"]+)"/)?.[1] ?? "";
  assert.ok(subtitle.length > 0);
  const ORIGINAL_LENGTH = 172; // "...with no Other Project Expenses records. Sent only when at least one project is missing." fitted at 1366px; longer text was cut off with an ellipsis
  assert.ok(subtitle.length <= ORIGINAL_LENGTH, `subtitle is ${subtitle.length} characters; it must stay within ${ORIGINAL_LENGTH} so it is not truncated`);
});

test("other-expenses entry: the checked-count label and the run-now sentence follow the new definition", () => {
  const s = section("other-expenses");
  assert.match(s, /eligibleLabel: "Eligible projects checked \(Non Man-Hour Budget entered\)"/);
  assert.match(s, /matchPhrase: "project with a Non Man-Hour Budget entered is missing Other Project Expenses"/);
});

test("the unpaid-invoices entry and the flag names are untouched", () => {
  const s = section("unpaid-invoices");
  assert.match(s, /Weekly reminder of Raised \/ Submitted and Partially Paid invoices dated 30\+ calendar days ago/);
  assert.match(s, /eligibleLabel: "Raised \/ Submitted and Partially Paid invoices checked"/);
  assert.match(src, /flagName: "MISSING_EXPENSE_EMAIL_ENABLED"/);
  assert.match(src, /flagName: "UNPAID_INVOICE_EMAIL_ENABLED"/);
});
