import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultSetting, isReminderType, REMINDER_TYPES } from "./countryReminder.rules.js";

describe("country reminder settings: scope", () => {
  test("only the project reminder alerts switch is country-wise; there is no per-country weekly-email type", () => {
    assert.deepEqual([...REMINDER_TYPES], ["PROJECT_REMINDERS"]);
    assert.equal(isReminderType("PROJECT_REMINDERS"), true);
    assert.equal(isReminderType("WEEKLY_MISSING_EXPENSE"), false, "the missing-expense weekly email stays global");
    assert.equal(isReminderType("WEEKLY_UNPAID_INVOICE"), false, "the unpaid-invoice weekly email stays global");
  });

  test("default: project reminder alerts stay ON for every country, as they always were", () => {
    assert.deepEqual(defaultSetting("PROJECT_REMINDERS"), { enabled: true });
  });
});
