import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysBetween, isTimesheetPending, toIsoDate, utcMidnight } from "./timesheetPending.rules.js";

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 15, 30, 0));
}

describe("timesheetPending.rules", () => {
  it("counts calendar days at UTC midnight regardless of time of day", () => {
    const from = utcDate(2026, 7, 10);
    const to = utcDate(2026, 7, 18);
    assert.equal(daysBetween(from, to), 8);
  });

  it("treats 0 through 7 days as CURRENT", () => {
    assert.equal(isTimesheetPending(0), false);
    assert.equal(isTimesheetPending(7), false);
  });

  it("treats more than 7 days as PENDING", () => {
    assert.equal(isTimesheetPending(8), true);
  });

  it("emits an ISO date (YYYY-MM-DD) from a UTC midnight date", () => {
    assert.equal(toIsoDate(utcMidnight(utcDate(2026, 7, 20))), "2026-08-20");
  });
});
