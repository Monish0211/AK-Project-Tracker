import { normalizeProjectCode } from "../utils/projectMatching";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Excel serial-to-epoch math is UTC-anchored, so the calendar date must be
// read back with UTC getters — reading with local getters would shift the
// date by the host's timezone offset.
function excelSerialToDateKey(serial: number): string | null {
  const utcMs = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(utcMs);
  if (isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

// `new Date(dateInstance)` / `new Date(dateString)` construct a date anchored
// to local midnight, so the calendar date must be read back with local
// getters (using UTC getters here would shift the date by the timezone offset).
function localDateToDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseExcelDateKey(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return localDateToDateKey(value);
  if (typeof value === "number") return excelSerialToDateKey(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    const num = Number(trimmed);
    if (!isNaN(num) && num > 10000 && num < 100000) return excelSerialToDateKey(num);
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : localDateToDateKey(date);
  }
  return null;
}

export function getCellText(row: unknown[], index: number | undefined): string {
  if (index === undefined || index === -1) return "";
  return String(row[index] ?? "").trim();
}

// ---------------------------------------------------------------------------
// Project matching
// ---------------------------------------------------------------------------

// Re-exported so every existing importer of normalizeProjectCode from this
// file keeps working unchanged — the canonical implementation (PR Number +
// Job Number aware) now lives in utils/projectMatching.ts, shared by every
// module that needs to reconcile a project code, not just timesheet import.
export { normalizeProjectCode };
