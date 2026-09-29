import { apiClient } from "./apiClient";

/** Mirrors Backend's expenseImport.types.ts ImportRunResult/SheetImportResult exactly — see that file for the authoritative shape/comments. */
export interface ImportableExpenseRowDto {
  particulars: string;
  amount: number;
  anomaly: boolean;
  anomalyReason?: string;
  category: string;
}

export interface SheetImportResultDto {
  sheetName: string;
  rawPrIdentifier: string;
  matchedProjectId: string | null;
  matchedPrNo: string | null;
  unmatchedReason?: string;
  rowsFound: number;
  rowsImportable: ImportableExpenseRowDto[];
  rowsSkippedCreditOnly: { particulars: string; creditAmount: number }[];
  rowsSkippedNoAmount: { particulars: string }[];
  rowsSkippedNonNumericDebit: { particulars: string; rawDebit: string }[];
  rowsPendingCategoryDecision: { particulars: string; amount: number }[];
  computedDebitOnlyTotal: number;
  existingManualExpenses: { id: string; category: string; description: string; totalCost: number }[];
  changeStatus:
    | "newImport"
    | "unchangedSkipped"
    | "changedWillSupersede"
    | "unmatchedPr"
    | "noImportableRows"
    | "awaitingManualConfirmation"
    | "invalidFormat";
  previousActiveImportedTotal?: number;
}

export interface ImportRunResultDto {
  batchId: string | null;
  status: "Succeeded" | "PartiallySucceeded" | "Failed" | "RejectedDuplicate" | "NothingToImport";
  rejectedDuplicateOfBatchId?: string;
  rejectedDuplicateUploadedAt?: string;
  totalSheetsFound: number;
  totalRowsFound: number;
  totalRowsImported: number;
  totalRowsSkipped: number;
  sheets: SheetImportResultDto[];
}

function buildImportFormData(file: File, confirmedProjectIds?: string[]): FormData {
  const formData = new FormData();
  formData.append("file", file);
  if (confirmedProjectIds && confirmedProjectIds.length > 0) {
    formData.append("confirmedProjectIds", JSON.stringify(confirmedProjectIds));
  }
  return formData;
}

/** Parses + classifies only, never writes — POST /projects/expenses/import/preview. */
export function previewExpenseImport(file: File): Promise<ImportRunResultDto> {
  return apiClient.postFormData<ImportRunResultDto>("/projects/expenses/import/preview", buildImportFormData(file));
}

/** Same logic as preview, persists under one new ExpenseImportBatch where applicable — POST /projects/expenses/import. `confirmedProjectIds` carries forward any PR the user explicitly confirmed despite existing manual expenses (see the preview's existingManualExpenses per sheet). */
export function commitExpenseImport(file: File, confirmedProjectIds: string[] = []): Promise<ImportRunResultDto> {
  return apiClient.postFormData<ImportRunResultDto>(
    "/projects/expenses/import",
    buildImportFormData(file, confirmedProjectIds)
  );
}
