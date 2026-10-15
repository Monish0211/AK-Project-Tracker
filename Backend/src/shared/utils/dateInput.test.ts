import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { dateInput, parseStrictDateInput } from "./dateInput.js";

const iso = (v: unknown) => parseStrictDateInput(v)?.toISOString() ?? null;

test("accepts the formats the app already sends, with unchanged timezone behavior", () => {
  // Same results as the previous z.coerce.date() (new Date(value)) for valid input.
  for (const v of ["2026-04-01", "2026-01-01T00:00:00.000Z", "2026-10-01T10:30:00+05:30", "2026-10-01T10:30:00.123456Z", "2024-02-29", "1900-01-01", "2100-12-31"]) {
    assert.equal(iso(v), new Date(v).toISOString(), v);
  }
  assert.equal(iso("2026-04-01"), "2026-04-01T00:00:00.000Z", "date-only stays UTC midnight");
  assert.equal(iso("  2026-04-01  "), "2026-04-01T00:00:00.000Z", "outer whitespace is trimmed");
  const d = new Date("2026-05-05T00:00:00.000Z");
  assert.equal(parseStrictDateInput(d), d, "a valid Date object passes through unchanged");
});

test("rejects the production bug value and other out-of-range years", () => {
  for (const v of ["20226-04-01", "+020226-04-01", "202-04-01", "1899-12-31", "2101-01-01", "0001-01-01", "9999-12-31"]) {
    assert.equal(parseStrictDateInput(v), null, v);
  }
  assert.equal(parseStrictDateInput(new Date("20226-04-01")), null, "five-digit-year Date object");
  assert.equal(parseStrictDateInput(new Date(Number.NaN)), null, "Invalid Date object");
});

test("rejects impossible calendar dates instead of rolling them over", () => {
  for (const v of ["2026-02-30", "2025-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-01-01T24:00:00Z", "2026-01-01T10:60:00Z"]) {
    assert.equal(parseStrictDateInput(v), null, v);
  }
});

test("rejects malformed strings and non-date types", () => {
  for (const v of ["", "   ", "abc", "2026-4-1", "01/04/2026", "2026/04/01", "2026-04-01junk", 1775001600000, true, {}, []]) {
    assert.equal(parseStrictDateInput(v), null, JSON.stringify(v));
  }
});

test("zod field: clear message, optional/nullable unaffected", () => {
  const schema = z.object({ d: dateInput("Project End Date").optional().nullable() });
  const bad = schema.safeParse({ d: "20226-04-01" });
  assert.equal(bad.success, false);
  assert.equal(bad.error!.issues[0]!.message, "Project End Date must be a valid date (YYYY-MM-DD) with a year between 1900 and 2100.");
  assert.deepEqual(schema.parse({}), {});
  assert.deepEqual(schema.parse({ d: null }), { d: null });
  assert.equal(schema.parse({ d: "2026-04-01" }).d!.toISOString(), "2026-04-01T00:00:00.000Z");
  const required = z.object({ d: dateInput("Project Start Date") });
  assert.equal(required.safeParse({}).success, false, "a required date is still required");
});
