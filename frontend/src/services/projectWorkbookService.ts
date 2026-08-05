import ExcelJS from "exceljs";
import type { Project } from "../types/Project";
import type { QuantityItem } from "../types/QuantityItem";
import { createEmptyProject, inferPrCategory, inferDomesticForeign } from "../utils/createEmptyProject";
import { syncInvoiceItemsWithQuantity } from "./invoiceSyncService";
import { getProjectCommercialSummary } from "./invoiceProgressService";
import { getEmployees } from "./employeeService";
import { getPmoCoordinators } from "./pmoCoordinatorService";
import { UOM_OPTIONS } from "../utils/quantityCalculations";

// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH: sheet names + column schema.
// Export, Import, and the Sample Template all build/read the exact same
// structure defined here — nothing about the workbook shape is duplicated
// per-caller. Changing a column means changing it once, here.
// ─────────────────────────────────────────────────────────────────────────

export const SHEET_NAMES = {
  projects: "Projects",
  quantity: "Quantity Details",
  milestones: "Payment Milestones",
  expense: "Expense Budget",
  lookup: "Lookup",
  instructions: "Instructions",
} as const;

type ValidationType = "list" | "date" | "number" | "text";

interface ColumnDef {
  header: string;
  key: string;
  width: number;
  required?: boolean;
  validationType?: ValidationType;
  /** Column letter on the Lookup sheet this column's dropdown reads from. */
  lookupColumn?: string;
  numFmt?: string;
  align?: "left" | "right" | "center";
}

const PROJECTS_COLUMNS: ColumnDef[] = [
  { header: "PR Number", key: "prNo", width: 18, required: true },
  { header: "PR Category", key: "prCategory", width: 18, required: false, validationType: "list", lookupColumn: "B" },
  { header: "PO Month", key: "poMonth", width: 14, validationType: "date", numFmt: "mmm-yyyy" },
  { header: "Client Name", key: "client", width: 22, required: true },
  { header: "Department", key: "department", width: 24, required: true, validationType: "list", lookupColumn: "A" },
  { header: "Domestic / Foreign", key: "domesticForeign", width: 18, required: false, validationType: "list", lookupColumn: "J" },
  { header: "Project Title", key: "projectTitle", width: 30, required: true },
  { header: "Project Manager", key: "primaryProjectManager", width: 20 },
  { header: "Project Engineer", key: "projectEngineer", width: 20 },
  { header: "Project Coordinator", key: "projectCoordinator", width: 20 },
  { header: "PMO Coordinator", key: "pmoCoordinator", width: 20, validationType: "list", lookupColumn: "L" },
  { header: "Project Status", key: "projectStatus", width: 16, validationType: "list", lookupColumn: "E" },
  { header: "Contract Type", key: "contractType", width: 16, validationType: "list", lookupColumn: "D" },
  { header: "Work Order Status", key: "workOrderStatus", width: 18, validationType: "list", lookupColumn: "F" },
  { header: "Currency", key: "currency", width: 12, validationType: "list", lookupColumn: "C" },
  { header: "Exchange Rate", key: "exchangeRate", width: 14, validationType: "number", align: "right" },
  { header: "Work Order Value", key: "workOrderValue", width: 18, required: true, validationType: "number", align: "right" },
  { header: "Invoice Raised", key: "invoiceRaised", width: 16, validationType: "number", align: "right" },
  { header: "Payment Received", key: "paymentReceived", width: 16, validationType: "number", align: "right" },
  { header: "Outstanding", key: "outstanding", width: 16, align: "right" },
  { header: "Start Date", key: "startDate", width: 14, validationType: "date", numFmt: "dd-mmm-yyyy" },
  { header: "End Date", key: "endDate", width: 14, validationType: "date", numFmt: "dd-mmm-yyyy" },
  { header: "Remarks", key: "remarks", width: 30 },
];

const QUANTITY_COLUMNS: ColumnDef[] = [
  { header: "PR Number", key: "prNo", width: 18, required: true },
  { header: "SL", key: "sl", width: 8, align: "center" },
  { header: "Description", key: "description", width: 34, required: true },
  { header: "Qty", key: "qty", width: 12, required: true, validationType: "number", align: "right" },
  { header: "UOM", key: "uom", width: 14, required: true, validationType: "list", lookupColumn: "I" },
  { header: "Unit Rate", key: "unitRate", width: 16, required: true, validationType: "number", align: "right" },
  { header: "Rate (INR)", key: "rateINR", width: 16, align: "right" },
  { header: "WO Value", key: "woValue", width: 16, align: "right" },
  { header: "Assigned To", key: "assignedTo", width: 20 },
];

const MILESTONES_COLUMNS: ColumnDef[] = [
  { header: "PR Number", key: "prNo", width: 18, required: true },
  { header: "Milestone Name", key: "milestoneName", width: 24 },
  { header: "Payment %", key: "paymentPercentage", width: 14, required: true, validationType: "number", align: "right" },
  { header: "Due Date", key: "dueDate", width: 14, validationType: "date", numFmt: "dd-mmm-yyyy" },
  { header: "Amount", key: "amount", width: 16, align: "right" },
  { header: "Payment Terms", key: "paymentTerms", width: 24, validationType: "list", lookupColumn: "G" },
  { header: "Sequence", key: "sequence", width: 10, align: "center" },
];

const EXPENSE_COLUMNS: ColumnDef[] = [
  { header: "PR Number", key: "prNo", width: 18, required: true },
  { header: "Expense Category", key: "category", width: 22, required: true, validationType: "list", lookupColumn: "M" },
  { header: "Budget", key: "budget", width: 16, required: true, validationType: "number", align: "right" },
  { header: "Currency", key: "currency", width: 12, validationType: "list", lookupColumn: "C" },
  { header: "Remarks", key: "remarks", width: 30 },
];

export const EXPENSE_CATEGORIES = ["Travel", "Accommodation", "Software", "Equipment", "Consumables", "Miscellaneous"];
const DEFAULT_DEPARTMENTS = ["Design Engineering Services", "Environment", "Risk Management", "Training"];
const PR_CATEGORIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "Qatar", "Elixir Qatar", "FZI"];
const CURRENCIES = ["INR", "USD", "EUR", "AED", "OMR", "QAR"];
const CONTRACT_TYPES = ["LUMP SUM", "UNIT RATE", "MAN-HOUR", "RATE CONTRACT"];
const PROJECT_STATUSES = ["Not Started", "Ongoing", "Active", "On Hold", "Completed", "Cancelled"];
const WORK_ORDER_STATUSES = ["Yet to Receive", "Received", "Closed", "Cancelled"];
const PAYMENT_TERMS = [
  "100% After Completion",
  "100% Advance",
  "50% Advance / 50% Completion",
  "30% / 40% / 30%",
  "25% / 25% / 25% / 25%",
  "Milestone Based",
];
const GST_OPTIONS = ["Yes", "No"];
const COUNTRIES = ["India", "Malaysia", "Oman", "UAE", "Qatar", "Saudi Arabia", "Singapore"];

export interface LookupLists {
  departments: string[];
  prCategories: string[];
  currencies: string[];
  contractTypes: string[];
  projectStatuses: string[];
  workOrderStatuses: string[];
  paymentTerms: string[];
  gst: string[];
  uom: string[];
  countries: string[];
  reportingManagers: string[];
  pmoCoordinators: string[];
  expenseCategories: string[];
}

export function getLookupLists(projects: Project[]): LookupLists {
  const dynamicDepartments = projects.map((p) => p.department).filter(Boolean);
  const departments = Array.from(new Set([...DEFAULT_DEPARTMENTS, ...dynamicDepartments])).sort();

  const reportingManagers = Array.from(
    new Set(getEmployees().map((e) => e.reportingManager?.trim()).filter((v): v is string => !!v))
  ).sort();

  return {
    departments,
    prCategories: PR_CATEGORIES,
    currencies: CURRENCIES,
    contractTypes: CONTRACT_TYPES,
    projectStatuses: PROJECT_STATUSES,
    workOrderStatuses: WORK_ORDER_STATUSES,
    paymentTerms: PAYMENT_TERMS,
    gst: GST_OPTIONS,
    uom: [...UOM_OPTIONS],
    countries: COUNTRIES,
    reportingManagers,
    pmoCoordinators: getPmoCoordinators(),
    expenseCategories: EXPENSE_CATEGORIES,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// STYLING — one set of rules applied identically to every data sheet.
// ─────────────────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
const REQUIRED_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
const ALT_ROW_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFECEFF1" } },
  bottom: { style: "thin", color: { argb: "FFECEFF1" } },
  left: { style: "thin", color: { argb: "FFECEFF1" } },
  right: { style: "thin", color: { argb: "FFECEFF1" } },
};

function setupHeaderAndColumns(sheet: ExcelJS.Worksheet, columns: ColumnDef[]) {
  columns.forEach((col, idx) => {
    const cell = sheet.getCell(1, idx + 1);
    cell.value = col.header;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF475569" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
    sheet.getColumn(idx + 1).width = col.width;
  });
  sheet.getRow(1).height = 26;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
}

function applyValidation(cell: ExcelJS.Cell, col: ColumnDef, lookupCounts: Record<string, number>) {
  if (col.validationType === "list" && col.lookupColumn) {
    const count = lookupCounts[col.lookupColumn] || 1;
    cell.dataValidation = {
      type: "list",
      allowBlank: !col.required,
      formulae: [`${SHEET_NAMES.lookup}!$${col.lookupColumn}$1:$${col.lookupColumn}$${count}`],
      showErrorMessage: true,
      errorTitle: "Invalid Option",
      error: `Please select a valid ${col.header} from the dropdown list.`,
    };
  } else if (col.validationType === "date") {
    cell.dataValidation = {
      type: "date",
      operator: "greaterThan",
      formulae: [new Date(1900, 0, 1)],
      allowBlank: !col.required,
      showErrorMessage: true,
      errorTitle: "Invalid Date",
      error: `Please enter a valid date for ${col.header}.`,
    };
  } else if (col.validationType === "number") {
    cell.dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      formulae: [0],
      allowBlank: !col.required,
      showErrorMessage: true,
      errorTitle: "Invalid Number",
      error: `Please enter a valid non-negative number for ${col.header}.`,
    };
  }
}

/** Writes one data row (real or blank) with full formatting + validation. */
function writeDataRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  columns: ColumnDef[],
  values: Record<string, string | number | Date | undefined>,
  lookupCounts: Record<string, number>
) {
  columns.forEach((col, colIdx) => {
    const cell = sheet.getCell(rowIndex, colIdx + 1);
    const value = values[col.key];
    if (value !== undefined && value !== "") {
      cell.value = value as ExcelJS.CellValue;
    }
    cell.font = { name: "Segoe UI", size: 10 };
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", horizontal: col.align || "left" };

    if (col.required) {
      cell.fill = REQUIRED_FILL;
    } else if (rowIndex % 2 === 1) {
      cell.fill = ALT_ROW_FILL;
    }

    if (col.numFmt) cell.numFmt = col.numFmt;
    applyValidation(cell, col, lookupCounts);
  });
}

function addLookupSheet(workbook: ExcelJS.Workbook, lists: LookupLists) {
  const sheet = workbook.addWorksheet(SHEET_NAMES.lookup);
  const columns: Array<{ letter: string; values: string[] }> = [
    { letter: "A", values: lists.departments },
    { letter: "B", values: lists.prCategories },
    { letter: "C", values: lists.currencies },
    { letter: "D", values: lists.contractTypes },
    { letter: "E", values: lists.projectStatuses },
    { letter: "F", values: lists.workOrderStatuses },
    { letter: "G", values: lists.paymentTerms },
    { letter: "H", values: lists.gst },
    { letter: "I", values: lists.uom },
    { letter: "J", values: lists.countries },
    { letter: "K", values: lists.reportingManagers.length ? lists.reportingManagers : ["-"] },
    { letter: "L", values: lists.pmoCoordinators },
    { letter: "M", values: lists.expenseCategories },
  ];

  const counts: Record<string, number> = {};
  columns.forEach(({ letter, values }) => {
    values.forEach((val, idx) => {
      sheet.getCell(`${letter}${idx + 1}`).value = val;
    });
    counts[letter] = Math.max(values.length, 1);
  });

  sheet.state = "hidden";
  return counts;
}

function addInstructionsSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet(SHEET_NAMES.instructions);
  sheet.views = [{ showGridLines: true }];

  sheet.getCell("A1").value = "iFluids PMO Portal — Project Workbook Instructions";
  sheet.getCell("A1").font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FF1E3A8A" } };

  sheet.getCell("A3").value =
    "This workbook uses ONE common structure for Export, Import, and the Sample Template — a project you export can always be re-imported unchanged.";
  sheet.getCell("A3").font = { name: "Segoe UI", size: 11, italic: true };

  const rows: string[][] = [
    ["Required Sheets", "Do not rename, delete, or reorder: Projects, Quantity Details, Payment Milestones, Expense Budget, Lookup, Instructions."],
    ["Joining Key", "Every row in Quantity Details / Payment Milestones / Expense Budget must repeat the same PR Number as its project's row in Projects."],
    ["Multiple Rows", "One project may have several Quantity Activities, several Payment Milestones, and several Expense Budget lines — give each its own row. Never combine several activities into a single row."],
    ["Mandatory Fields", "Columns shaded light gray are mandatory (e.g. PR Number, Client Name, Project Title, Department, Work Order Value on Projects; Description/Qty/UOM/Unit Rate on Quantity Details)."],
    ["Date Format", "Dates display as dd-mmm-yyyy (e.g. 02-Feb-2026). PO Month displays as mmm-yyyy."],
    ["Currency", "Work Order Value, rates and budgets are entered in the project's own Currency; the portal converts to INR using the Exchange Rate."],
    ["Dropdowns", "Department, Currency, Contract Type, Project Status, Work Order Status, Payment Terms, UOM and Expense Category must be chosen from their dropdown lists (sourced from the hidden Lookup sheet)."],
    ["PR Number Uniqueness", "Each PR Number must be unique — duplicates within the file, or a PR Number that already exists in the portal, will fail import."],
    ["Import Behaviour", "If any row in any sheet fails validation, the entire import is rejected — nothing is partially imported. Fix the reported row numbers and re-upload."],
    ["Sample Template", "Download Sample Template uses this exact layout, prefilled with one example project (PR-SAMPLE-001) — replace the sample rows with your own data, keeping the same PR Number across its Quantity/Milestone/Expense rows."],
  ];

  const headers = ["Topic", "Details"];
  headers.forEach((h, idx) => {
    const cell = sheet.getCell(5, idx + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  rows.forEach((row, rowIdx) => {
    row.forEach((val, colIdx) => {
      const cell = sheet.getCell(6 + rowIdx, colIdx + 1);
      cell.value = val;
      cell.font = { name: "Segoe UI", size: 10, bold: colIdx === 0 };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = THIN_BORDER;
    });
  });

  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 90;
}

// ─────────────────────────────────────────────────────────────────────────
// ROW SHAPING — Project -> flat rows per sheet (used by Export + Template).
// ─────────────────────────────────────────────────────────────────────────

function projectToRow(p: Project) {
  const comm = getProjectCommercialSummary(p);
  const prCategory = inferPrCategory(p.prNo, p.prCategory);
  const domesticForeign = inferDomesticForeign(p.currency, prCategory, p.domesticForeign);
  return {
    prNo: p.prNo || "",
    prCategory,
    poMonth: p.poMonth ? parsePoMonthToDate(p.poMonth) : undefined,
    client: p.client || "",
    department: p.department || "",
    domesticForeign,
    projectTitle: p.projectTitle || "",
    primaryProjectManager: p.primaryProjectManager || "",
    projectEngineer: p.projectEngineer || "",
    projectCoordinator: p.projectCoordinator || "",
    pmoCoordinator: p.pmoCoordinator || "",
    projectStatus: p.projectStatus || "Active",
    contractType: p.contractType || "LUMP SUM",
    workOrderStatus: p.workOrderStatus || "",
    currency: p.currency || "INR",
    exchangeRate: p.currentExchangeRate || 1,
    workOrderValue: p.workOrderValue || 0,
    invoiceRaised: comm.totalInvoiceRaised || 0,
    paymentReceived: p.paymentReceived || 0,
    outstanding: comm.pendingDue || 0,
    startDate: p.projectStartDate ? new Date(p.projectStartDate) : undefined,
    endDate: p.projectEndDate ? new Date(p.projectEndDate) : undefined,
    remarks: p.remarks || "",
  };
}

function parsePoMonthToDate(poMonth: string): Date | undefined {
  const parts = poMonth.split("-");
  if (parts.length < 2) return undefined;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!year || !month) return undefined;
  // ExcelJS serializes Date cell values using UTC getters, so this must be
  // built with Date.UTC — a local-timezone constructor shifts the date back
  // by a day in positive-UTC-offset zones (e.g. IST) once written to the cell.
  return new Date(Date.UTC(year, month - 1, 1));
}

function quantityItemsToRows(p: Project) {
  return (p.quantityItems || []).map((item, idx) => ({
    prNo: p.prNo || "",
    sl: idx + 1,
    description: item.description || "",
    qty: item.woQty || 0,
    uom: item.uom || "",
    unitRate: item.unitRate || 0,
    rateINR: item.unitRateINR || 0,
    woValue: item.woValue || 0,
    assignedTo: item.assignedTo || "",
  }));
}

function milestonesToRows(p: Project) {
  return (p.paymentMilestones || []).map((m, idx) => ({
    prNo: p.prNo || "",
    milestoneName: m.milestoneName || "",
    paymentPercentage: m.paymentPercentage || 0,
    dueDate: m.dueDate ? new Date(m.dueDate) : undefined,
    amount: m.amount || 0,
    paymentTerms: p.paymentTerms || "",
    sequence: idx + 1,
  }));
}

function expensesToRows(p: Project) {
  return (p.nonManhourExpenses || []).map((e) => ({
    prNo: p.prNo || "",
    category: e.category || "",
    budget: e.totalCost || 0,
    currency: p.currency || "INR",
    remarks: e.remarks || "",
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// SAMPLE DATA — used only by the Sample Template, same shape as real rows.
// ─────────────────────────────────────────────────────────────────────────

function buildSampleProject(): Project {
  return {
    ...createEmptyProject(),
    prNo: "PR-SAMPLE-001",
    poMonth: "2026-01",
    client: "Sample Client Ltd",
    department: "Design Engineering Services",
    projectTitle: "Sample Engineering Project — QRA & HAZOP Study",
    primaryProjectManager: "Jane Doe",
    projectEngineer: "John Smith",
    projectCoordinator: "Alex Roy",
    pmoCoordinator: getPmoCoordinators()[0] || "",
    projectStatus: "Active",
    contractType: "LUMP SUM",
    workOrderStatus: "Received",
    currency: "INR",
    currentExchangeRate: 1,
    contractExchangeRate: 1,
    workOrderValue: 1000000,
    workOrderValueINR: 1000000,
    paymentReceived: 250000,
    paymentReceivedINR: 250000,
    projectStartDate: "2026-02-01",
    projectEndDate: "2026-07-31",
    remarks: "Sample row — replace with your own project data.",
    quantityItems: [
      { id: "sample-q1", description: "Process Safety Study", woQty: 1, invoiceQty: 0, pendingQty: 1, uom: "LUMP SUM", assignedTo: "John Smith", currency: "INR", unitRate: 600000, exchangeRate: 1, unitRateINR: 600000, woValue: 600000, pendingAmount: 600000 },
      { id: "sample-q2", description: "HAZOP Facilitation", woQty: 10, invoiceQty: 0, pendingQty: 10, uom: "DAY", assignedTo: "Alex Roy", currency: "INR", unitRate: 25000, exchangeRate: 1, unitRateINR: 25000, woValue: 250000, pendingAmount: 250000 },
      { id: "sample-q3", description: "Final Report & Close-out", woQty: 1, invoiceQty: 0, pendingQty: 1, uom: "LUMP SUM", assignedTo: "Jane Doe", currency: "INR", unitRate: 150000, exchangeRate: 1, unitRateINR: 150000, woValue: 150000, pendingAmount: 150000 },
    ],
    paymentType: "Multiple",
    paymentTerms: "30% / 40% / 30%",
    paymentMilestones: [
      { id: "sample-m1", milestoneName: "Mobilization Advance", paymentPercentage: 30, dueDate: "2026-02-05", amount: 300000 },
      { id: "sample-m2", milestoneName: "Draft Report Submission", paymentPercentage: 40, dueDate: "2026-05-15", amount: 400000 },
      { id: "sample-m3", milestoneName: "Final Report & Close-out", paymentPercentage: 30, dueDate: "2026-07-31", amount: 300000 },
    ],
    nonManhourExpenses: [
      { id: "sample-e1", category: "Travel", description: "Site visit airfare", quantity: 1, unitCost: 45000, totalCost: 45000, remarks: "Round trip, 2 engineers" },
      { id: "sample-e2", category: "Accommodation", description: "Site hotel stay", quantity: 1, unitCost: 30000, totalCost: 30000, remarks: "10 nights" },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// WORKBOOK BUILDER — the ONE function Export and Sample Template both call.
// ─────────────────────────────────────────────────────────────────────────

async function buildWorkbook(projects: Project[], blankRowCount: number): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  const lists = getLookupLists(projects);

  const projectsSheet = workbook.addWorksheet(SHEET_NAMES.projects);
  const quantitySheet = workbook.addWorksheet(SHEET_NAMES.quantity);
  const milestonesSheet = workbook.addWorksheet(SHEET_NAMES.milestones);
  const expenseSheet = workbook.addWorksheet(SHEET_NAMES.expense);

  setupHeaderAndColumns(projectsSheet, PROJECTS_COLUMNS);
  setupHeaderAndColumns(quantitySheet, QUANTITY_COLUMNS);
  setupHeaderAndColumns(milestonesSheet, MILESTONES_COLUMNS);
  setupHeaderAndColumns(expenseSheet, EXPENSE_COLUMNS);

  const lookupCounts = addLookupSheet(workbook, lists);
  addInstructionsSheet(workbook);

  let projectsRow = 2;
  let quantityRow = 2;
  let milestonesRow = 2;
  let expenseRow = 2;

  projects.forEach((p) => {
    writeDataRow(projectsSheet, projectsRow++, PROJECTS_COLUMNS, projectToRow(p), lookupCounts);
    quantityItemsToRows(p).forEach((row) => writeDataRow(quantitySheet, quantityRow++, QUANTITY_COLUMNS, row, lookupCounts));
    milestonesToRows(p).forEach((row) => writeDataRow(milestonesSheet, milestonesRow++, MILESTONES_COLUMNS, row, lookupCounts));
    expensesToRows(p).forEach((row) => writeDataRow(expenseSheet, expenseRow++, EXPENSE_COLUMNS, row, lookupCounts));
  });

  // Extra blank, fully-formatted/validated rows so users can add more
  // projects directly in the downloaded file (Sample Template only).
  for (let i = 0; i < blankRowCount; i++) {
    writeDataRow(projectsSheet, projectsRow++, PROJECTS_COLUMNS, {}, lookupCounts);
    writeDataRow(quantitySheet, quantityRow++, QUANTITY_COLUMNS, {}, lookupCounts);
    writeDataRow(milestonesSheet, milestonesRow++, MILESTONES_COLUMNS, {}, lookupCounts);
    writeDataRow(expenseSheet, expenseRow++, EXPENSE_COLUMNS, {}, lookupCounts);
  }

  return workbook;
}

export async function buildExportWorkbook(projects: Project[]): Promise<ExcelJS.Workbook> {
  return buildWorkbook(projects, 0);
}

export async function buildSampleTemplateWorkbook(): Promise<ExcelJS.Workbook> {
  return buildWorkbook([buildSampleProject()], 30);
}

export async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────
// IMPORT — reads all sheets, validates, reconstructs Project[] exactly.
// ─────────────────────────────────────────────────────────────────────────

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  const v = cell.value;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "result" in (v as any)) return String((v as any).result ?? "");
  if (typeof v === "object" && "text" in (v as any)) return String((v as any).text ?? "");
  return String(v).trim();
}

function cellNumber(cell: ExcelJS.Cell | undefined): number {
  const text = cellText(cell);
  const num = Number(text);
  return isNaN(num) ? 0 : num;
}

function cellDateKey(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined || cell.value === "") return "";
  const v = cell.value;
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const text = cellText(cell);
  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  "pr number": ["pr number", "pr no", "pr_number", "pr_no", "prno", "pr #", "pr#"],
  "pr category": ["pr category", "pr_category", "prcategory", "category", "region", "location", "country", "pr type"],
  "po month": ["po month", "po_month", "pomonth", "month", "po date"],
  "client name": ["client name", "client", "client_name", "customer", "customer name", "customer_name"],
  "department": ["department", "dept", "department name", "business unit", "bu"],
  "domestic / foreign": ["domestic / foreign", "domestic/foreign", "domestic foreign", "domestic_foreign", "domestic", "foreign", "market type"],
  "project title": ["project title", "project_title", "projecttitle", "title", "project name", "project_name", "description"],
  "project manager": ["project manager", "primary project manager", "primary_project_manager", "pm", "project_manager", "manager"],
  "project engineer": ["project engineer", "project_engineer", "pe", "engineer"],
  "project coordinator": ["project coordinator", "project_coordinator", "pc", "coordinator"],
  "pmo coordinator": ["pmo coordinator", "pmo_coordinator", "pmo", "pmo co-ordinator", "pmo manager", "pmo lead", "pmo name"],
  "project status": ["project status", "project_status", "status", "project_state"],
  "contract type": ["contract type", "contract_type", "type of contract", "billing type"],
  "work order status": ["work order status", "work_order_status", "wo status", "wo_status", "po status"],
  "currency": ["currency", "curr", "currency code"],
  "exchange rate": ["exchange rate", "exchange_rate", "ex rate", "ex_rate", "forex rate"],
  "work order value": ["work order value", "work_order_value", "wo value", "wo_value", "po value", "contract value", "value"],
  "invoice raised": ["invoice raised", "invoice_raised", "invoiced", "total invoiced", "billed"],
  "payment received": ["payment received", "payment_received", "collected", "total collected", "received"],
  "outstanding": ["outstanding", "pending due", "balance", "balance due"],
  "start date": ["start date", "start_date", "project start date", "commencement date"],
  "end date": ["end date", "end_date", "project end date", "completion date"],
  "remarks": ["remarks", "remark", "notes", "comments"],
};

function getCellByAliases(row: ExcelJS.Row, pMap: Record<string, number>, colKey: string): ExcelJS.Cell | undefined {
  const aliases = COLUMN_ALIASES[colKey.toLowerCase()] || [colKey.toLowerCase()];
  for (const alias of aliases) {
    const colIndex = pMap[alias];
    if (colIndex !== undefined) {
      return row.getCell(colIndex);
    }
  }
  return undefined;
}

function readHeaderMap(sheet: ExcelJS.Worksheet, columns: ColumnDef[], errors: string[]): Record<string, number> {
  const headerRow = sheet.getRow(1);
  const map: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value ?? "").trim().toLowerCase();
    if (text) map[text] = colNumber;
  });

  columns.forEach((col) => {
    if (col.required) {
      const aliases = COLUMN_ALIASES[col.header.toLowerCase()] || [col.header.toLowerCase()];
      const found = aliases.some((alias) => map[alias] !== undefined);
      if (!found) {
        errors.push(`Sheet "${sheet.name}": missing required column "${col.header}".`);
      }
    }
  });

  return map;
}

export interface ParsedWorkbookResult {
  projects: Project[];
  errors: string[];
}

export function parseProjectsWorkbook(workbook: ExcelJS.Workbook, existingProjects: Project[]): ParsedWorkbookResult {
  const errors: string[] = [];

  const projectsSheet = workbook.getWorksheet(SHEET_NAMES.projects);
  const quantitySheet = workbook.getWorksheet(SHEET_NAMES.quantity);
  const milestonesSheet = workbook.getWorksheet(SHEET_NAMES.milestones);
  const expenseSheet = workbook.getWorksheet(SHEET_NAMES.expense);

  if (!projectsSheet) errors.push(`Missing required sheet "${SHEET_NAMES.projects}".`);
  if (!quantitySheet) errors.push(`Missing required sheet "${SHEET_NAMES.quantity}".`);
  if (!milestonesSheet) errors.push(`Missing required sheet "${SHEET_NAMES.milestones}".`);
  if (!expenseSheet) errors.push(`Missing required sheet "${SHEET_NAMES.expense}".`);

  if (!projectsSheet || !quantitySheet || !milestonesSheet || !expenseSheet) {
    return { projects: [], errors };
  }

  const pMap = readHeaderMap(projectsSheet, PROJECTS_COLUMNS, errors);
  const qMap = readHeaderMap(quantitySheet, QUANTITY_COLUMNS, errors);
  const mMap = readHeaderMap(milestonesSheet, MILESTONES_COLUMNS, errors);
  const eMap = readHeaderMap(expenseSheet, EXPENSE_COLUMNS, errors);

  if (errors.length > 0) {
    return { projects: [], errors };
  }

  const existingPRNumbers = new Set(existingProjects.map((p) => p.prNo.trim().toLowerCase()));
  const seenPRNumbers = new Set<string>();

  interface DraftProject {
    prNo: string;
    fields: Record<string, any>;
    rowNum: number;
  }
  const drafts: DraftProject[] = [];

  const rowHasAnyValue = (row: ExcelJS.Row, columnIndices: number[]) =>
    columnIndices.some((idx) => {
      const v = row.getCell(idx).value;
      return v !== null && v !== undefined && v !== "";
    });

  // ── Sheet 1: Projects ──
  const pColumnIndices = Object.values(pMap);
  for (let r = 2; r <= projectsSheet.rowCount; r++) {
    const row = projectsSheet.getRow(r);
    if (!rowHasAnyValue(row, pColumnIndices)) continue;

    const get = (key: string) => getCellByAliases(row, pMap, key);
    const prNo = cellText(get("PR Number"));
    const prCategoryRaw = cellText(get("PR Category"));
    const prCategory = inferPrCategory(prNo, prCategoryRaw);
    const client = cellText(get("Client Name"));
    const projectTitle = cellText(get("Project Title"));
    const department = cellText(get("Department"));
    const domesticForeignRaw = cellText(get("Domestic / Foreign"));
    const currency = cellText(get("Currency")) || "INR";
    const domesticForeign = inferDomesticForeign(currency, prCategory, domesticForeignRaw);
    const contractType = cellText(get("Contract Type"));
    const workOrderStatus = cellText(get("Work Order Status"));
    const projectStatus = cellText(get("Project Status"));
    const pmoCoordinator = cellText(get("PMO Coordinator"));
    const workOrderValue = cellNumber(get("Work Order Value"));

    if (!prNo) errors.push(`Projects, Row ${r}: PR Number is missing.`);
    if (!client) errors.push(`Projects, Row ${r}: Client Name is missing.`);
    if (!projectTitle) errors.push(`Projects, Row ${r}: Project Title is missing.`);
    if (!department) errors.push(`Projects, Row ${r}: Department is missing.`);
    if (!workOrderValue) errors.push(`Projects, Row ${r}: Work Order Value is missing or zero.`);

    if (prNo) {
      const key = prNo.toLowerCase();
      if (seenPRNumbers.has(key)) {
        errors.push(`Projects, Row ${r}: Duplicate PR Number "${prNo}" within this file.`);
      }
      if (existingPRNumbers.has(key)) {
        errors.push(`Projects, Row ${r}: PR Number "${prNo}" already exists in the portal.`);
      }
      seenPRNumbers.add(key);
    }

    // Dropdown columns (Currency, Contract Type, Project Status, Work Order
    // Status, PMO Coordinator) accept whatever value the file actually has —
    // real project history predates the dropdown lists and uses free-form
    // phrasing ("Hold", "In progress", "Milestone Basis", etc.). The Lookup
    // sheet still drives the dropdown for NEW manual entries; import just
    // never rejects a row for using a value outside that list.

    const startDateRaw = cellText(get("Start Date"));
    const endDateRaw = cellText(get("End Date"));
    const startDate = cellDateKey(get("Start Date"));
    const endDate = cellDateKey(get("End Date"));
    if (startDateRaw && !startDate) errors.push(`Projects, Row ${r}: Start Date is invalid.`);
    if (endDateRaw && !endDate) errors.push(`Projects, Row ${r}: End Date is invalid.`);

    const poMonthKey = cellDateKey(get("PO Month"));
    const poMonth = poMonthKey ? poMonthKey.substring(0, 7) : "";

    const exchangeRate = cellNumber(get("Exchange Rate")) || 1;

    drafts.push({
      prNo,
      rowNum: r,
      fields: {
        client,
        department,
        prCategory,
        domesticForeign,
        projectTitle,
        primaryProjectManager: cellText(get("Project Manager")),
        projectEngineer: cellText(get("Project Engineer")),
        projectCoordinator: cellText(get("Project Coordinator")),
        pmoCoordinator,
        projectStatus,
        contractType,
        workOrderStatus,
        currency,
        exchangeRate,
        workOrderValue,
        invoiceRaised: cellNumber(get("Invoice Raised")),
        paymentReceived: cellNumber(get("Payment Received")),
        startDate,
        endDate,
        remarks: cellText(get("Remarks")),
        poMonth,
      },
    });
  }

  const draftsByPR = new Map(drafts.map((d) => [d.prNo.trim().toLowerCase(), d]));

  const quantityByPR = new Map<string, ReturnType<typeof buildQuantityDraft>[]>();
  if (qMap && quantitySheet) {
    const qColumnIndices = Object.values(qMap);
    for (let r = 2; r <= quantitySheet.rowCount; r++) {
      const row = quantitySheet.getRow(r);
      if (!rowHasAnyValue(row, qColumnIndices)) continue;
      const get = (key: string) => row.getCell(qMap[key.toLowerCase()]);
      const prNo = cellText(get("PR Number"));
      const description = cellText(get("Description"));
      const uom = cellText(get("UOM"));
      const qty = cellNumber(get("Qty"));
      const unitRate = cellNumber(get("Unit Rate"));

      if (!prNo) {
        errors.push(`Quantity Details, Row ${r}: PR Number is missing.`);
        continue;
      }
      if (!draftsByPR.has(prNo.trim().toLowerCase())) {
        errors.push(`Quantity Details, Row ${r}: PR Number "${prNo}" not found in Projects sheet.`);
        continue;
      }
      if (!description) errors.push(`Quantity Details, Row ${r}: Description is missing.`);
      if (!uom) errors.push(`Quantity Details, Row ${r}: UOM is missing.`);
      if (!qty) errors.push(`Quantity Details, Row ${r}: Qty is missing or zero.`);
      if (!unitRate) errors.push(`Quantity Details, Row ${r}: Unit Rate is missing or zero.`);

      const key = prNo.trim().toLowerCase();
      const list = quantityByPR.get(key) || [];
      list.push(buildQuantityDraft(description, qty, uom, unitRate, cellText(get("Assigned To"))));
      quantityByPR.set(key, list);
    }
  }

  const milestonesByPR = new Map<string, ReturnType<typeof buildMilestoneDraft>[]>();
  if (mMap && milestonesSheet) {
    const mColumnIndices = Object.values(mMap);
    for (let r = 2; r <= milestonesSheet.rowCount; r++) {
      const row = milestonesSheet.getRow(r);
      if (!rowHasAnyValue(row, mColumnIndices)) continue;
      const get = (key: string) => row.getCell(mMap[key.toLowerCase()]);
      const prNo = cellText(get("PR Number"));
      const paymentPercentage = cellNumber(get("Payment %"));
      const paymentTerms = cellText(get("Payment Terms"));

      if (!prNo) {
        errors.push(`Payment Milestones, Row ${r}: PR Number is missing.`);
        continue;
      }
      if (!draftsByPR.has(prNo.trim().toLowerCase())) {
        errors.push(`Payment Milestones, Row ${r}: PR Number "${prNo}" not found in Projects sheet.`);
        continue;
      }
      if (!paymentPercentage) errors.push(`Payment Milestones, Row ${r}: Payment % is missing or zero.`);

      const dueDateRaw = cellText(get("Due Date"));
      const dueDate = cellDateKey(get("Due Date"));
      if (dueDateRaw && !dueDate) errors.push(`Payment Milestones, Row ${r}: Due Date is invalid.`);

      const key = prNo.trim().toLowerCase();
      const list = milestonesByPR.get(key) || [];
      list.push(buildMilestoneDraft(cellText(get("Milestone Name")), paymentPercentage, dueDate));
      milestonesByPR.set(key, list);

      if (paymentTerms) {
        const draft = draftsByPR.get(key);
        if (draft) draft.fields.paymentTerms = paymentTerms;
      }
    }
  }

  const expensesByPR = new Map<string, ReturnType<typeof buildExpenseDraft>[]>();
  if (eMap && expenseSheet) {
    const eColumnIndices = Object.values(eMap);
    for (let r = 2; r <= expenseSheet.rowCount; r++) {
      const row = expenseSheet.getRow(r);
      if (!rowHasAnyValue(row, eColumnIndices)) continue;
      const get = (key: string) => row.getCell(eMap[key.toLowerCase()]);
      const prNo = cellText(get("PR Number"));
      const category = cellText(get("Expense Category"));
      const budget = cellNumber(get("Budget"));

      if (!prNo) {
        errors.push(`Expense Budget, Row ${r}: PR Number is missing.`);
        continue;
      }
      if (!draftsByPR.has(prNo.trim().toLowerCase())) {
        errors.push(`Expense Budget, Row ${r}: PR Number "${prNo}" not found in Projects sheet.`);
        continue;
      }
      if (!category) errors.push(`Expense Budget, Row ${r}: Expense Category is missing.`);
      if (!budget) errors.push(`Expense Budget, Row ${r}: Budget is missing or zero.`);

      const key = prNo.trim().toLowerCase();
      const list = expensesByPR.get(key) || [];
      list.push(buildExpenseDraft(category, budget, cellText(get("Remarks"))));
      expensesByPR.set(key, list);
    }
  }

  if (errors.length > 0) {
    return { projects: [], errors };
  }

  const projects: Project[] = drafts.map((draft) => {
    const key = draft.prNo.trim().toLowerCase();
    const quantityItems: QuantityItem[] = (quantityByPR.get(key) || []).map((q) => ({
      id: crypto.randomUUID(),
      description: q.description,
      woQty: q.qty,
      invoiceQty: 0,
      pendingQty: q.qty,
      uom: q.uom,
      assignedTo: q.assignedTo,
      currency: draft.fields.currency,
      exchangeRate: draft.fields.exchangeRate,
      unitRate: q.unitRate,
      unitRateINR: draft.fields.currency === "INR" ? q.unitRate : q.unitRate * draft.fields.exchangeRate,
      woValue: 0,
      pendingAmount: 0,
    }));

    if (quantityItems.length === 0) {
      const empty = createEmptyProject().quantityItems[0];
      quantityItems.push({ ...empty, id: crypto.randomUUID(), description: "Imported Activity" });
    }

    const milestoneDrafts = milestonesByPR.get(key) || [];
    const paymentMilestones = milestoneDrafts.length
      ? milestoneDrafts.map((m) => ({
          id: crypto.randomUUID(),
          milestoneName: m.milestoneName,
          paymentPercentage: m.paymentPercentage,
          dueDate: m.dueDate,
          amount: 0,
        }))
      : createEmptyProject().paymentMilestones;

    const nonManhourExpenses = (expensesByPR.get(key) || []).map((e) => ({
      id: crypto.randomUUID(),
      category: e.category,
      description: "",
      quantity: 1,
      unitCost: e.budget,
      totalCost: e.budget,
      remarks: e.remarks,
    }));

    const invoiceItems = syncInvoiceItemsWithQuantity(quantityItems, []);
    const invoiceRaised = draft.fields.invoiceRaised as number;
    if (invoiceRaised > 0 && invoiceItems.length > 0) {
      const invoiceRaisedINR = draft.fields.currency === "INR" ? invoiceRaised : invoiceRaised * draft.fields.exchangeRate;
      invoiceItems[0].invoices.push({
        id: crypto.randomUUID(),
        invoiceNo: `${draft.fields.prNo || "IMPORT"}-INV-001`,
        invoiceDate: new Date().toISOString().split("T")[0],
        description: "Imported invoice total (Excel import)",
        quantityBilled: 0,
        invoiceAmountINR: invoiceRaisedINR,
        status: "Raised",
        createdBy: "Excel Import",
      });
    }

    const paymentReceived = draft.fields.paymentReceived as number;
    const exchangeRate = draft.fields.exchangeRate as number;
    const currency = draft.fields.currency as string;
    const workOrderValue = draft.fields.workOrderValue as number;

    const timestamp = new Date().toISOString();

    return {
      ...createEmptyProject(),
      prNo: draft.prNo,
      poMonth: draft.fields.poMonth,
      prCategory: draft.fields.prCategory,
      domesticForeign: draft.fields.domesticForeign,
      client: draft.fields.client,
      department: draft.fields.department,
      projectTitle: draft.fields.projectTitle,
      primaryProjectManager: draft.fields.primaryProjectManager,
      projectEngineer: draft.fields.projectEngineer,
      projectCoordinator: draft.fields.projectCoordinator,
      pmoCoordinator: draft.fields.pmoCoordinator,
      projectStatus: draft.fields.projectStatus,
      contractType: draft.fields.contractType,
      workOrderStatus: draft.fields.workOrderStatus,
      remarks: draft.fields.remarks,
      projectStartDate: draft.fields.startDate,
      projectEndDate: draft.fields.endDate,
      currency,
      currentExchangeRate: exchangeRate,
      contractExchangeRate: exchangeRate,
      workOrderValue,
      workOrderValueINR: workOrderValue * exchangeRate,
      paymentReceived,
      paymentReceivedINR: currency === "INR" ? paymentReceived : paymentReceived * exchangeRate,
      paymentTerms: draft.fields.paymentTerms || "",
      paymentType: paymentMilestones.length > 1 ? "Multiple" : "Single",
      quantityItems,
      paymentMilestones,
      nonManhourExpenses,
      invoiceItems,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  return { projects, errors: [] };
}

function buildQuantityDraft(description: string, qty: number, uom: string, unitRate: number, assignedTo: string) {
  return { description, qty, uom, unitRate, assignedTo };
}

function buildMilestoneDraft(milestoneName: string, paymentPercentage: number, dueDate: string) {
  return { milestoneName, paymentPercentage, dueDate };
}

function buildExpenseDraft(category: string, budget: number, remarks: string) {
  return { category, budget, remarks };
}
