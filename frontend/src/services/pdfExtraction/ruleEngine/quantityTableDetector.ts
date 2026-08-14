/**
 * QUANTITY / COST TABLE DETECTOR — finds a table by its HEADER ROW rather
 * than assuming a fixed column order, then maps every following row
 * positionally against whichever columns that particular document's header
 * actually has. This is what lets the same detector handle both a classic
 * 4-column "Description | Qty | UOM | Rate" schedule AND a 2-column
 * "Scope of Work | Amount (INR)" costing table (no Qty/UOM/Rate at all) —
 * exactly the shape iFluids' own Techno-Commercial Proposals use — without
 * two different code paths.
 *
 * Column detection relies on pdfReader.ts preserving real column gaps as
 * tab characters; a header/row is only recognized where that structure
 * survived text extraction. Extracts every row; never merges two rows into
 * one, and always stops before a "Total" row rather than treating it as
 * a line item.
 */

import { parseNumeric } from "./contextMatcher";

export interface RawQuantityRow {
  description: string;
  qty: string;
  uom: string;
  unitRate: string;
  matchType: "table-match" | "regex";
}

type ColumnType = "description" | "qty" | "uom" | "rate" | "amount" | "gst" | "serial" | "unknown";
type ValueColumnType = "qty" | "uom" | "rate" | "amount";

const COLUMN_KEYWORDS: Record<Exclude<ColumnType, "unknown">, string[]> = {
  description: ["description", "scope of work", "activity", "particulars", "item"],
  qty: ["qty", "quantity"],
  uom: ["uom", "unit "],
  rate: ["unit rate", "unit price", "rate"],
  amount: ["amount", "total cost", "cost", "value"],
  gst: ["gst", "tax"],
  serial: ["sl.", "sl no", "s.no", "s. no", "si.no", "si. no", "sr.no", "sr. no"],
};

function classifyColumn(headerCell: string): ColumnType {
  const lower = headerCell.trim().toLowerCase();
  for (const [type, keywords] of Object.entries(COLUMN_KEYWORDS) as [Exclude<ColumnType, "unknown">, string[]][]) {
    if (keywords.some((k) => lower.includes(k))) return type;
  }
  return "unknown";
}

function splitCells(line: string): string[] {
  return line
    .split(/\t+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/** A header needs at least one description-like column and at least one of qty/rate/amount — otherwise it's just a heading, not a table. */
function isHeaderRow(columnTypes: ColumnType[]): boolean {
  const hasDescription = columnTypes.includes("description");
  const hasValueColumn = columnTypes.some((t) => t === "qty" || t === "rate" || t === "amount");
  return hasDescription && hasValueColumn;
}

/** A leading "1." / "1)" serial marker — stripped so the rest of that line's own content can be read as the start of that row's description. */
const LEADING_SERIAL_PATTERN = /^\s*\d{1,3}[.)]\s*/;

function resolveRowValues(
  collected: Partial<Record<ValueColumnType, string>>
): { qty: string; uom: string; unitRate: string } | null {
  const qty = collected.qty ? parseNumeric(collected.qty) : null;
  const rate = collected.rate ? parseNumeric(collected.rate) : null;
  const amount = collected.amount ? parseNumeric(collected.amount) : null;

  const resolvedQty = qty ?? 1;
  let resolvedRate: number;
  if (rate !== null) {
    resolvedRate = rate;
  } else if (amount !== null) {
    resolvedRate = resolvedQty > 0 ? amount / resolvedQty : amount;
  } else {
    return null; // no rate and no amount at all — not a usable row
  }

  return { qty: String(resolvedQty), uom: collected.uom?.trim() || "LUMP SUM", unitRate: String(resolvedRate) };
}

/**
 * Builds one row from every physical line a single logical row's
 * description wrapped across — a long "Scope of Work" cell in a narrow
 * column routinely spans 2-3 lines in a real rendered PDF, each of which
 * pdfjs-dist reports as its own separate line with no indication they
 * belong together except position. Each line contributes its own leading
 * (non-value) cell to the description and, on whichever single line the
 * row's value columns actually rendered on, fills those in — so a
 * 3-line-wrapped description with the amount only present on line 1
 * reconstructs correctly instead of losing lines 2-3 or misreading them
 * as separate (invalid, discarded) rows.
 */
function buildRowFromGroup(groupLines: string[], valueTypesInOrder: ValueColumnType[]): RawQuantityRow | null {
  const collected: Partial<Record<ValueColumnType, string>> = {};
  const descParts: string[] = [];

  for (const line of groupLines) {
    const cells = splitCells(line);
    if (cells.length <= 1) {
      if (cells[0]) descParts.push(cells[0]);
      continue;
    }

    // The first cell on any multi-cell line is always more description;
    // every cell after it fills the next not-yet-found value column, in
    // the header's own declared order — so a line with 2 trailing cells
    // (e.g. Rate and Amount both rendered on the same wrapped line) fills
    // both rather than only the first.
    descParts.push(cells[0]);
    const trailingCells = cells.slice(1);
    const pendingTypes = valueTypesInOrder.filter((t) => !(t in collected));
    trailingCells.forEach((cell, i) => {
      const type = pendingTypes[i];
      if (type) collected[type] = cell;
    });
  }

  const description = descParts.join(" ").replace(/\s+/g, " ").trim();
  if (!description) return null;

  const resolved = resolveRowValues(collected);
  if (!resolved) return null;

  return { description, ...resolved, matchType: "table-match" };
}

/**
 * Primary strategy for a table whose header has a serial-number column —
 * groups every line from one row's leading "1." marker up to (but not
 * including) the next one, so a wrapped multi-line description is
 * reassembled into a single row instead of being read as several broken
 * ones. A row is considered finished, and the next serial-leading line
 * treated as the start of a new one, only once its value columns
 * (Rate/Amount) have actually been found — a bare "2." on its own
 * wrapped line, with no value cells yet, is very unlikely to be a second
 * row starting mid-description.
 */
function detectSerialGroupedRows(lines: string[], valueTypesInOrder: ValueColumnType[]): RawQuantityRow[] {
  const rows: RawQuantityRow[] = [];
  let group: string[] = [];
  let groupHasValue = false;

  const flush = () => {
    if (group.length === 0) return;
    const row = buildRowFromGroup(group, valueTypesInOrder);
    if (row) rows.push(row);
    group = [];
    groupHasValue = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/\btotal\b/i.test(line)) {
      flush();
      break;
    }

    const leadingSerialMatch = line.match(LEADING_SERIAL_PATTERN);
    if (leadingSerialMatch && (group.length === 0 || groupHasValue)) {
      flush();
      group.push(line.replace(LEADING_SERIAL_PATTERN, ""));
    } else {
      group.push(line);
    }

    if (splitCells(line).length >= 2) groupHasValue = true;
  }
  flush();

  return rows;
}

/** Secondary strategy for a table with no serial column — each row is still expected on one line, positionally mapped against the header (no wrap-tolerance, since there's no serial marker to anchor a row boundary on). */
function detectPerLineRows(lines: string[], columnTypes: ColumnType[]): RawQuantityRow[] {
  const rows: RawQuantityRow[] = [];
  let consecutiveMisses = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (rows.length > 0) break;
      continue;
    }

    const cells = splitCells(line);
    if (/\btotal\b/i.test(line) && cells.length <= columnTypes.length) break;

    if (cells.length < 2) {
      consecutiveMisses++;
      if (consecutiveMisses > 3) break;
      continue;
    }

    const byType: Partial<Record<ColumnType, string>> = {};
    columnTypes.forEach((type, index) => {
      if (cells[index] !== undefined && type !== "unknown" && type !== "serial") {
        byType[type] = cells[index];
      }
    });

    if (!byType.description) {
      consecutiveMisses++;
      if (consecutiveMisses > 3) break;
      continue;
    }

    const resolved = resolveRowValues(byType);
    if (!resolved) {
      consecutiveMisses++;
      if (consecutiveMisses > 3) break;
      continue;
    }

    consecutiveMisses = 0;
    rows.push({ description: byType.description, ...resolved, matchType: "table-match" });
  }

  return rows;
}

/** Primary entry point — a genuine header row is found first, then rows are read with (if the header has a serial column) or without wrap-tolerant grouping. */
function detectHeaderedQuantityTable(searchText: string): RawQuantityRow[] {
  const lines = searchText.split("\n");

  let columnTypes: ColumnType[] | null = null;
  let headerLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const candidateTypes = splitCells(line).map(classifyColumn);
    if (isHeaderRow(candidateTypes)) {
      columnTypes = candidateTypes;
      headerLineIndex = i;
      break;
    }
  }

  if (!columnTypes) return [];

  const dataLines = lines.slice(headerLineIndex + 1);
  const hasLeadingSerialColumn = columnTypes[0] === "serial";
  const valueTypesInOrder = columnTypes.filter(
    (t): t is ValueColumnType => t === "qty" || t === "uom" || t === "rate" || t === "amount"
  );

  if (hasLeadingSerialColumn) {
    return detectSerialGroupedRows(dataLines, valueTypesInOrder);
  }
  return detectPerLineRows(dataLines, columnTypes);
}

/**
 * Fallback strategy — no bordered table with a recognizable header exists
 * (a header-less list of activities, one per line, in the fixed
 * "<description> <qty> <uom> <rate>" column order QuantityCard itself
 * uses). This is the original Stage 3 heuristic, kept as a second pass so
 * documents without real table structure still extract correctly.
 */
const HEADERLESS_ROW_PATTERN = /^(.{4,80}?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z\s-]{1,14})\s+([\d,]+(?:\.\d+)?)\s*$/;

function detectHeaderlessQuantityRows(searchText: string): RawQuantityRow[] {
  const rows: RawQuantityRow[] = [];
  for (const rawLine of searchText.split("\n")) {
    const line = rawLine.trim().replace(/^[➢➤•\-*·]\s*/, "");
    if (!line || line.includes("%")) continue; // "%" guards against a Payment Milestone line of similar shape

    const match = line.match(HEADERLESS_ROW_PATTERN);
    if (!match) continue;

    const [, description, qty, uom, unitRate] = match;
    rows.push({
      description: description.trim(),
      qty,
      uom: uom.trim(),
      unitRate: unitRate.replace(/,/g, ""),
      matchType: "regex",
    });
  }
  return rows;
}

export function detectQuantityTable(searchText: string): RawQuantityRow[] {
  const headered = detectHeaderedQuantityTable(searchText);
  if (headered.length > 0) return headered;
  return detectHeaderlessQuantityRows(searchText);
}
