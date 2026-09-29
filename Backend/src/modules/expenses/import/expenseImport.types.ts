/** Shared shapes for the Other Project Expenses Excel Import pipeline (Sept 2026) — parser -> service -> controller. */

/** One real transaction row extracted from a PR sheet, already classified per the Debit-only rule. Never includes Opening/Current Total/Closing Balance rows — those are excluded before this shape exists at all (see expenseImportParser.ts's row-detection rule: blank Particulars = not a transaction row). */
export type ParsedExpenseRow =
  | { outcome: "import"; rowIndex: number; particulars: string; amount: number; anomaly: false }
  | { outcome: "import"; rowIndex: number; particulars: string; amount: number; anomaly: true; anomalyReason: string }
  | { outcome: "skippedCreditOnly"; rowIndex: number; particulars: string; creditAmount: number }
  | { outcome: "skippedNoAmount"; rowIndex: number; particulars: string }
  | { outcome: "skippedNonNumericDebit"; rowIndex: number; particulars: string; rawDebit: string };

export interface ParsedSheet {
  sheetName: string;
  /** Raw PR identifier exactly as read from the sheet (tab name) — never normalized in the parser itself; normalization happens in the service, at match time, via the existing normalizeProjectCode() utility. */
  rawPrIdentifier: string;
  rows: ParsedExpenseRow[];
  /**
   * P1 fix (Sept 2026 regression QA, Finding 3) — false when no recognizable
   * header row was found, or the header row is missing a required column
   * (Particulars/Debit/Credit). Distinguishes "this sheet's structure is
   * malformed, we can't tell what's in it" from a genuinely valid sheet that
   * simply has zero transaction rows (rows: [] with isValidStructure: true).
   * Always true when rows.length > 0, since only a structurally-valid sheet
   * can ever produce rows.
   */
  isValidStructure: boolean;
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
}

/** One row that will actually be persisted, after category mapping and project matching succeed. */
export interface ImportableExpenseRow {
  particulars: string;
  amount: number;
  anomaly: boolean;
  anomalyReason?: string | undefined;
  category: string;
}

/** Per-sheet processing outcome, before/after project matching + change detection — this is the shape both the preview and the real commit return, so they can never drift apart. */
export interface SheetImportResult {
  sheetName: string;
  rawPrIdentifier: string;
  matchedProjectId: string | null;
  matchedPrNo: string | null;
  unmatchedReason?: string;
  rowsFound: number;
  rowsImportable: ImportableExpenseRow[];
  rowsSkippedCreditOnly: { particulars: string; creditAmount: number }[];
  rowsSkippedNoAmount: { particulars: string }[];
  rowsSkippedNonNumericDebit: { particulars: string; rawDebit: string }[];
  rowsPendingCategoryDecision: { particulars: string; amount: number }[];
  computedDebitOnlyTotal: number;
  /** Existing manually-entered (importBatchId = null) active rows already on this project, for the §9 confirmation UX — empty when there are none. */
  existingManualExpenses: { id: string; category: string; description: string; totalCost: number }[];
  /** Comparison against this project's currently-active imported total, if any prior import exists for it. "awaitingManualConfirmation" means this PR has existing manually-entered expenses and the caller has not yet explicitly confirmed proceeding (§9 of the approved design) — never written in this state, regardless of commit mode. */
  changeStatus:
    | "newImport"
    | "unchangedSkipped"
    | "changedWillSupersede"
    | "unmatchedPr"
    | "noImportableRows"
    | "awaitingManualConfirmation"
    | "invalidFormat";
  previousActiveImportedTotal?: number | undefined;
}

export interface ImportRunResult {
  batchId: string | null;
  /** "NothingToImport" — every sheet was unmatched, unchanged, awaiting manual confirmation, or had no importable rows; no batch was created, and the file's hash is NOT registered, so a legitimate follow-up upload of the same bytes (e.g. once confirmedProjectIds is supplied) is never falsely rejected as a duplicate. */
  status: "Succeeded" | "PartiallySucceeded" | "Failed" | "RejectedDuplicate" | "NothingToImport";
  rejectedDuplicateOfBatchId?: string;
  rejectedDuplicateUploadedAt?: string;
  totalSheetsFound: number;
  totalRowsFound: number;
  totalRowsImported: number;
  totalRowsSkipped: number;
  sheets: SheetImportResult[];
}
