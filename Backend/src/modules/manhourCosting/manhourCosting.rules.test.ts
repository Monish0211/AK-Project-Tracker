import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { hourlyRateChanged, inrManpowerCost, projectRefreshStatus, round2, runStatusFromTasks, splitCostByMonth } from "./manhourCosting.rules.js";

/** Phase 4 / Option A - the pure rules of the central manpower costing. */

describe("INR manpower cost = hours x the current employee rate (existing rounding)", () => {
  test("the brief's example: 100 / 80 / 60 hours at INR 1,000, then INR 1,500, then INR 1,200", () => {
    assert.deepEqual([100, 80, 60].map((h) => inrManpowerCost(h, 1000)), [100_000, 80_000, 60_000]);
    assert.deepEqual([100, 80, 60].map((h) => inrManpowerCost(h, 1500)), [150_000, 120_000, 90_000]);
    assert.deepEqual([100, 80, 60].map((h) => inrManpowerCost(h, 1200)), [120_000, 96_000, 72_000], "a decrease works exactly like an increase");
  });

  test("rounds once to two decimals, as before; zero hours and a zero rate give zero", () => {
    assert.equal(inrManpowerCost(7.33, 1250.5), round2(7.33 * 1250.5));
    assert.equal(inrManpowerCost(0, 1500), 0);
    assert.equal(inrManpowerCost(100, 0), 0);
    assert.equal(inrManpowerCost(Number.NaN, 1500), 0);
  });
});

describe("when a save counts as a rate change", () => {
  test("only a real change triggers a recalculation", () => {
    assert.equal(hourlyRateChanged(1000, 1500), true);
    assert.equal(hourlyRateChanged(1500, 1200), true);
    assert.equal(hourlyRateChanged(1500, 1500), false, "unchanged rate: no work");
    assert.equal(hourlyRateChanged(1500, undefined), false, "an update that carries no rate: no work");
    assert.equal(hourlyRateChanged(null, 1500), true, "a first rate");
    assert.equal(hourlyRateChanged(1500, 0), true, "a change to zero is still a change");
  });
});

describe("refresh status is never reported as current while a project is pending or failed", () => {
  test("project status: FAILED wins over PENDING, otherwise CURRENT", () => {
    assert.equal(projectRefreshStatus([]), "CURRENT");
    assert.equal(projectRefreshStatus(["PENDING"]), "PENDING");
    assert.equal(projectRefreshStatus(["PENDING", "FAILED"]), "FAILED");
    assert.equal(projectRefreshStatus(["FAILED"]), "FAILED");
  });

  test("run status is SUCCEEDED only when every task succeeded", () => {
    assert.equal(runStatusFromTasks([]), "SUCCEEDED");
    assert.equal(runStatusFromTasks(["SUCCEEDED", "SUCCEEDED"]), "SUCCEEDED");
    assert.equal(runStatusFromTasks(["SUCCEEDED", "FAILED"]), "PARTIAL");
    assert.equal(runStatusFromTasks(["SUCCEEDED", "PENDING"]), "PARTIAL");
    assert.equal(runStatusFromTasks(["FAILED", "FAILED"]), "FAILED");
    assert.equal(runStatusFromTasks(["PENDING", "PENDING"]), "PENDING");
  });
});

describe("the month split always adds up to the lifetime figure", () => {
  test("INR: months telescope to round2(total hours x rate)", () => {
    const months = [
      { month: "2026-10", hours: 33.33 },
      { month: "2026-09", hours: 12.34 },
      { month: "2026-11", hours: 7.77 },
    ];
    const split = splitCostByMonth(months, 1250.55);
    assert.deepEqual(split.map((m) => m.month), ["2026-09", "2026-10", "2026-11"], "ascending");
    const totalHours = round2(33.33 + 12.34 + 7.77);
    const sum = round2(split.reduce((s, m) => s + m.costInr, 0));
    assert.equal(sum, inrManpowerCost(totalHours, 1250.55), "no cent lost or invented");
  });

  test("regional: the monthly regional amounts add up to the lifetime regional amount", () => {
    const toRegional = (inr: number) => Math.round((inr / 243.156) * 1000) / 1000;
    const months = [{ month: "2026-09", hours: 40.25 }, { month: "2026-10", hours: 59.75 }];
    const split = splitCostByMonth(months, 1500, toRegional);
    const lifetimeInr = inrManpowerCost(100, 1500);
    assert.equal(round2(split.reduce((s, m) => s + m.costInr, 0)), lifetimeInr);
    assert.equal(Math.round(split.reduce((s, m) => s + (m.costRegional ?? 0), 0) * 1000) / 1000, toRegional(lifetimeInr));
  });

  test("no months, no regional converter", () => {
    assert.deepEqual(splitCostByMonth([], 1500), []);
    assert.equal(splitCostByMonth([{ month: "2026-10", hours: 1 }], 1500)[0]?.costRegional, null);
  });
});
