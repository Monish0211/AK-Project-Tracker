import * as XLSX from "xlsx";
import { AppError } from "../../../shared/utils/AppError.js";
import type { ParsedExpenseRow, ParsedSheet, ParsedWorkbook } from "./expenseImport.types.js";

/**
 * Other Project Expenses — Excel Import parser (Sept 2026). Purpose-built
 * against the verified real structure of the audited "PR 12 series.xlsx"
 * workbook, not a generic tolerant/synonym-matching parser like Timesheets'
 * excelParser.service.ts — every assumption below was confirmed against the
 * real file, not guessed:
 *
 *  - One sheet per PR; the sheet's own tab name IS the PR identifier
 *    (e.g. "PR 12005") — also repeated as a standalone cell early in the
 *    sheet, but the tab name is simpler and equally reliable, so that's
 *    what's used.
 *  - A fixed letterhead block precedes the real header row; the header row
 *    is located by scanning for the row containing "Particulars", not by a
 *    fixed row index (PR 12005's sheet has extra trailing blank columns the
 *    other two don't, so column POSITION also isn't assumed — only column
 *    NAME).
 *  - A row counts as a transaction row iff its Particulars cell is
 *    non-empty AND that text isn't a recognized accounting summary/total/
 *    balance label (see isAccountingSummaryLabel() below).
 *
 *    P0 fix (Sept 2026 regression QA) — "blank Particulars" alone used to be
 *    treated as sufficient to exclude Opening Balance/Current Total/Closing
 *    Balance rows, which held for the originally-audited workbook only
 *    because ITS summary rows happen to put their label in the Date column,
 *    leaving Particulars genuinely blank. That's an artifact of one column
 *    order, not a property of summary rows in general: a workbook whose
 *    columns are reordered (e.g. Particulars first) can put a summary row's
 *    own label text directly into the Particulars-mapped column, and the
 *    old rule then treated it as non-blank Particulars — an ordinary-looking
 *    transaction — importing a fake expense equal to the ledger's own
 *    subtotal (confirmed as a real, reproducible data-corruption bug: a
 *    "Current Total :" row with Debit=11000 was actually persisted as a
 *    ProjectExpense). The fix adds a content check on whatever text ends up
 *    in the Particulars-mapped column, regardless of which physical Excel
 *    column that came from — still fully column-name-driven (findHeaderRowIndex/
 *    header.indexOf("Particulars") are unchanged), never a fixed position.
 */

const MAX_HEADER_SCAN_ROWS = 20;
const REQUIRED_HEADERS = ["Particulars", "Debit", "Credit"];

/**
 * P1 fix (Sept 2026 regression QA, Finding 2) — a genuine .xlsx is always a
 * ZIP archive (OOXML), whose first two bytes are the ZIP local-file-header
 * signature "PK" (0x50 0x4B). The `xlsx` library is tolerant enough to parse
 * plain text (e.g. a .txt renamed to .xlsx) as a minimal single-sheet
 * workbook instead of throwing, which previously surfaced as a confusing
 * "workbook contains no sheets" / empty-result outcome rather than a clear
 * rejection. This is a container-format sniff only — it does NOT validate
 * that the ZIP's contents are a well-formed workbook; a corrupted-but-still-
 * ZIP file is still caught by the existing XLSX.read() try/catch below.
 */
function isLikelyXlsxContainer(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  const scanLimit = Math.min(rows.length, MAX_HEADER_SCAN_ROWS);
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i] ?? [];
    if (row.some((cell) => String(cell ?? "").trim() === "Particulars")) {
      return i;
    }
  }
  return -1;
}

function toCellNumber(cell: unknown): number | null {
  if (typeof cell === "number") return cell;
  if (cell === null || cell === undefined) return null;
  const trimmed = String(cell).trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNonNumericText(cell: unknown): string | null {
  if (typeof cell === "number") return null;
  const trimmed = String(cell ?? "").trim();
  if (trimmed === "") return null; // blank is "no value", not "non-numeric text"
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? null : trimmed;
}

/**
 * P0 fix (Sept 2026) — recognized accounting summary/total/balance labels,
 * matched as the ENTIRE normalized Particulars text (never a substring), so
 * a real transaction whose description merely contains one of these words
 * (e.g. "Total Travel expenses", a real description already seen in
 * production manual entries) is never accidentally excluded — only a cell
 * whose content IS one of these labels, and nothing else, counts.
 * Normalization: trim, drop a trailing colon/period/whitespace run, lower-
 * case. This deliberately does not depend on which physical Excel column
 * the text came from — the caller always passes whatever text is in the
 * column already identified by header name as "Particulars".
 */
const ACCOUNTING_SUMMARY_LABELS = new Set([
  "current total",
  "grand total",
  "sub total",
  "subtotal",
  "total",
  "opening balance",
  "closing balance",
  "balance carried forward",
  "balance brought forward",
  "balance c/f",
  "balance b/f",
]);

function isAccountingSummaryLabel(particulars: string): boolean {
  const normalized = particulars
    .trim()
    .replace(/[:.\s]+$/, "")
    .trim()
    .toLowerCase();
  return ACCOUNTING_SUMMARY_LABELS.has(normalized);
}

function classifyRow(rowIndex: number, particulars: string, rawDebit: unknown, rawCredit: unknown): ParsedExpenseRow {
  const nonNumericDebitText = isNonNumericText(rawDebit);
  if (nonNumericDebitText !== null) {
    // Case E — Debit contains non-numeric text: skip, report a data-quality warning. Never coerced, never treated as 0.
    return { outcome: "skippedNonNumericDebit", rowIndex, particulars, rawDebit: nonNumericDebitText };
  }

  const debit = toCellNumber(rawDebit);
  const credit = toCellNumber(rawCredit);

  if (debit !== null && debit > 0) {
    if (credit !== null && credit !== 0) {
      // Case C — both populated: import Debit only, ignore Credit, flag as a data anomaly.
      return {
        outcome: "import",
        rowIndex,
        particulars,
        amount: debit,
        anomaly: true,
        anomalyReason: `Both Debit (${debit}) and Credit (${credit}) are populated on this row — Debit was used, Credit was ignored per the Debit-only rule.`,
      };
    }
    // Case A — Debit numeric > 0, Credit blank: import.
    return { outcome: "import", rowIndex, particulars, amount: debit, anomaly: false };
  }

  if (credit !== null && credit !== 0) {
    // Case B — Debit blank/0, Credit numeric: skip completely. Credit is NEVER used as a fallback.
    return { outcome: "skippedCreditOnly", rowIndex, particulars, creditAmount: credit };
  }

  // Case D — both blank/0: not a real transaction row (shouldn't normally
  // reach here, since a row with blank Particulars is already excluded
  // before classifyRow() is called — this covers the edge case of a row
  // that has Particulars text but genuinely no amount in either column).
  return { outcome: "skippedNoAmount", rowIndex, particulars };
}

export function parseExpenseWorkbook(buffer: Buffer): ParsedWorkbook {
  if (!isLikelyXlsxContainer(buffer)) {
    throw new AppError("The uploaded file could not be read as an Excel workbook.", 400);
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    throw new AppError("The uploaded file could not be read as an Excel workbook.", 400);
  }

  if (workbook.SheetNames.length === 0) {
    throw new AppError("The uploaded workbook contains no sheets.", 400);
  }

  const sheets: ParsedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: "" });

    const headerIdx = findHeaderRowIndex(rawRows);
    if (headerIdx === -1) {
      // No recognizable header row — reported per-sheet, not a whole-request failure (other sheets may still be valid).
      // isValidStructure: false (Finding 3) — distinct from a valid sheet that just has zero rows.
      sheets.push({ sheetName, rawPrIdentifier: sheetName, rows: [], isValidStructure: false });
      continue;
    }

    const header = (rawRows[headerIdx] ?? []).map((h) => String(h ?? "").trim());
    const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
    if (missing.length > 0) {
      // Header row found, but missing a required column — same isValidStructure: false treatment as no-header-found.
      sheets.push({ sheetName, rawPrIdentifier: sheetName, rows: [], isValidStructure: false });
      continue;
    }

    const idxParticulars = header.indexOf("Particulars");
    const idxDebit = header.indexOf("Debit");
    const idxCredit = header.indexOf("Credit");

    const rows: ParsedExpenseRow[] = [];
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i] ?? [];
      const particulars = String(row[idxParticulars] ?? "").trim();
      // Row-detection rule: blank Particulars = not a transaction row (the
      // original workbook's summary rows put their label in the Date
      // column, leaving this genuinely blank). PLUS (P0 fix): a non-blank
      // Particulars that IS itself a recognized summary/total/balance label
      // is also not a transaction row — this is what a reordered-column
      // workbook needs, where the summary label instead lands directly in
      // the Particulars-mapped column. Both checks are content-based, not
      // positional: whichever column header.indexOf("Particulars") found.
      if (!particulars) continue;
      if (isAccountingSummaryLabel(particulars)) continue;
      rows.push(classifyRow(i, particulars, row[idxDebit], row[idxCredit]));
    }

    sheets.push({ sheetName, rawPrIdentifier: sheetName, rows, isValidStructure: true });
  }

  return { sheets };
}
