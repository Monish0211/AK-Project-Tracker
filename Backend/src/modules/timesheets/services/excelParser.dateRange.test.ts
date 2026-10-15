import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { parseTimesheetWorkbook } from "./excelParser.service.js";

/**
 * Timesheet Excel import (manual upload and the KEKA mailbox poll) — work
 * dates (Oct 2026): a five-digit year or an impossible ISO date becomes an
 * invalid row instead of a stored date the database driver cannot read back;
 * every format the parser already accepted still parses to the same day.
 */
function workbook(rows: unknown[][]): Buffer {
  const header = ["Employee Number", "Employee Name", "PR Number", "Date", "Task", "Total Hours"];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const row = (task: string, date: unknown) => ["E001", "Emp One", "PR-1", date, task, 8];

test("valid work dates in every accepted shape still parse to the same UTC day", () => {
  const result = parseTimesheetWorkbook(workbook([
    row("iso", "2026-10-01"),
    row("iso-ts", "2026-10-01T00:00:00.000Z"),
    row("human", "01-Oct-2026"),
    row("serial", 46296), // Excel serial for 2026-10-01
    row("leap", "2024-02-29"),
  ]));
  const byTask = Object.fromEntries(result.rows.map((r) => [r.task, r.workDate.toISOString().slice(0, 10)]));
  assert.deepEqual(byTask, { iso: "2026-10-01", "iso-ts": "2026-10-01", human: "2026-10-01", serial: "2026-10-01", leap: "2024-02-29" });
  assert.equal(result.invalidRows.length, 0);
});

test("five-digit years, impossible ISO dates and out-of-range years become invalid rows", () => {
  const result = parseTimesheetWorkbook(workbook([
    row("ok", "2026-10-01"),
    row("five-digit", "20226-04-01"),
    row("feb30", "2026-02-30"),
    row("old", "1850-01-01"),
    row("future-serial", 99999), // Excel serial in the year 2173
  ]));
  assert.deepEqual(result.rows.map((r) => r.task), ["ok"]);
  assert.equal(result.invalidRows.length, 4);
  assert.deepEqual(result.invalidRows.map((r) => r.rowNumber), [2, 3, 4, 5]);
});
