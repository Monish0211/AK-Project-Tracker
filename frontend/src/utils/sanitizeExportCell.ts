/**
 * P2-11 — neutralizes CSV/spreadsheet formula injection (CWE-1236) before a
 * value is ever handed to a spreadsheet export library. Same character
 * class and mitigation as the existing, already-verified audit-log export
 * fix (frontend/src/services/authAuditLogService.ts's sanitizeCsvCell()) —
 * duplicated here deliberately rather than importing from that file, so
 * this P2 change never touches P0-protected code. Any string whose first
 * character is one Excel/Sheets treats as a formula trigger (=, +, -, @)
 * is prefixed with a single quote, which every spreadsheet application
 * renders as plain text instead of evaluating — this is also the standard
 * Excel "force text" convention, so it degrades gracefully rather than
 * visibly mangling ordinary values. Values that merely CONTAIN, but don't
 * START with, these characters are returned unchanged.
 */
function sanitizeExportValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/**
 * Sanitizes every string field of one export row (a flat object, one
 * spreadsheet row) in place-safe fashion (returns a new object, never
 * mutates the input) — used by ReportExportButtons.tsx immediately before
 * XLSX.utils.json_to_sheet(), which is the single chokepoint every Reports
 * export table (Financial, Profitability, Customer/Employee/Commercial/
 * Quantity/Invoice Analytics, etc.) already funnels through.
 */
export function sanitizeExportRow<T extends Record<string, unknown>>(row: T): T {
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    sanitized[key] = sanitizeExportValue(row[key]);
  }
  return sanitized as T;
}

export function sanitizeExportRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => sanitizeExportRow(row));
}
