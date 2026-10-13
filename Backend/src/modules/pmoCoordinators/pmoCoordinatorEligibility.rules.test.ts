import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyCoordinatorEligibility,
  normalizeCoordinatorEmail,
  type CoordinatorAccountFacts,
} from "./services/pmoCoordinatorEligibility.rules.js";

const good: CoordinatorAccountFacts = {
  id: "u1",
  fullName: "Test User",
  isActive: true,
  accountLocked: false,
  hasProjectsModule: true,
};

test("PMO Coordinator eligibility — no account", () => {
  const r = classifyCoordinatorEligibility([]);
  assert.deepEqual(r, { status: "no_account", reasons: [], account: null, matchingAccountCount: 0 });
});

test("PMO Coordinator eligibility — two accounts differing only by case are ambiguous, none picked", () => {
  const r = classifyCoordinatorEligibility([good, { ...good, id: "u2" }]);
  assert.equal(r.status, "ambiguous_account");
  assert.equal(r.account, null);
  assert.equal(r.matchingAccountCount, 2);
  assert.deepEqual(r.reasons, []);
});

test("PMO Coordinator eligibility — one active, unlocked account with Projects is eligible", () => {
  const r = classifyCoordinatorEligibility([good]);
  assert.equal(r.status, "eligible");
  assert.deepEqual(r.reasons, []);
  assert.equal(r.account?.id, "u1");
});

test("PMO Coordinator eligibility — each single failing check", () => {
  assert.equal(classifyCoordinatorEligibility([{ ...good, isActive: false }]).status, "inactive");
  assert.equal(classifyCoordinatorEligibility([{ ...good, accountLocked: true }]).status, "locked");
  assert.equal(classifyCoordinatorEligibility([{ ...good, hasProjectsModule: false }]).status, "no_projects_module");
});

test("PMO Coordinator eligibility — several failures: stable first status, every reason listed", () => {
  const r = classifyCoordinatorEligibility([{ ...good, isActive: false, accountLocked: true, hasProjectsModule: false }]);
  assert.equal(r.status, "inactive");
  assert.deepEqual(r.reasons, ["inactive", "locked", "no_projects_module"]);
  const r2 = classifyCoordinatorEligibility([{ ...good, accountLocked: true, hasProjectsModule: false }]);
  assert.equal(r2.status, "locked");
  assert.deepEqual(r2.reasons, ["locked", "no_projects_module"]);
});

test("PMO Coordinator email normalization — trim + lower-case only, no other change", () => {
  assert.equal(normalizeCoordinatorEmail("  Manojkumar.g@ifluids.com "), "manojkumar.g@ifluids.com");
  assert.equal(normalizeCoordinatorEmail("ashvini.c@ifluids.com"), "ashvini.c@ifluids.com");
});
