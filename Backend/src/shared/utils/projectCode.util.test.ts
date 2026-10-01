import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameProjectCode, normalizeProjectCode } from "./projectCode.util.js";

/**
 * Sept 2026 — Hours Overrun / Project Code fix regression. Locks in the one
 * rule the whole Timesheet-to-Project matching pipeline depends on: a code
 * with no Job Number never matches the same PR digits carrying one, however
 * the Job Number is spelled — this is what previously risked "PR 12034"
 * (no Job Number) being confused with "PR-12034_01" (Job Number 01).
 */

test("normalizeProjectCode: a plain PR code and its Job-Numbered variant never collapse to the same key", () => {
  const plain = normalizeProjectCode("PR 12034");
  const jobNumbered = normalizeProjectCode("PR-12034_01");
  assert.notEqual(plain, "");
  assert.notEqual(jobNumbered, "");
  assert.notEqual(plain, jobNumbered, '"PR 12034" and "PR-12034_01" must normalize to different keys');
  assert.equal(isSameProjectCode("PR 12034", "PR-12034_01"), false);
});

test("normalizeProjectCode: every spelling of the SAME Job-Numbered code collapses to one key", () => {
  const underscoreForm = normalizeProjectCode("PR-12034_01");
  const textualForm = normalizeProjectCode("PR 12034 Job No. 01");
  const noPunctuationForm = normalizeProjectCode("PR12034_1");
  assert.equal(underscoreForm, textualForm);
  assert.equal(underscoreForm, noPunctuationForm);
  assert.ok(isSameProjectCode("PR-12034_01", "PR 12034 Job No. 01"));
  assert.ok(isSameProjectCode("PR-12034_01", "PR12034_1"));
});

test("normalizeProjectCode: every spelling of the SAME plain (no Job Number) code collapses to one key", () => {
  const spaced = normalizeProjectCode("PR 12034");
  const hyphenated = normalizeProjectCode("PR-12034");
  const bare = normalizeProjectCode("PR12034");
  assert.equal(spaced, hyphenated);
  assert.equal(spaced, bare);
  assert.ok(isSameProjectCode("PR 12034", "PR-12034"));
});

test("normalizeProjectCode: different Job Numbers on the same PR digits never match", () => {
  assert.notEqual(normalizeProjectCode("PR-12034_01"), normalizeProjectCode("PR-12034_02"));
  assert.equal(isSameProjectCode("PR-12034_01", "PR-12034_02"), false);
});

test("normalizeProjectCode: an unparseable/empty code never matches anything, including itself", () => {
  assert.equal(normalizeProjectCode(""), "");
  assert.equal(normalizeProjectCode("   "), "");
  assert.equal(isSameProjectCode("", ""), false);
  assert.equal(isSameProjectCode("PR 12034", ""), false);
});
