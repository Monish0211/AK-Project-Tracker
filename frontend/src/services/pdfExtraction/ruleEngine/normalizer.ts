import type {
  ExtractedField,
  PdfImportGeneralInformation,
  PdfImportMilestone,
  PdfImportQuantityRow,
} from "../../../types/PdfImport";
import type { ExtractedFields, RawMilestone, RawQuantityRow } from "./extractor";
import type { FieldCandidate } from "./confidenceScoring";
import { confidenceForMatchType } from "./confidenceScoring";
import { parseNumeric } from "./contextMatcher";

/**
 * STAGE 2 — Normalizer. Extractor.ts only ever answers "did I find text
 * that looks like X"; this file is the only place that turns that raw text
 * into the canonical form GeneralInfoCard/QuantityCard/PaymentMilestoneCard
 * actually expect (ISO dates, currency codes, the exact casing of a fixed
 * dropdown option, etc). A value that can't be confidently normalized is
 * left blank (confidence 0) with a warning explaining why — never guessed,
 * per the "never invent values" rule.
 */

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad2 = (n: number) => n.toString().padStart(2, "0");

export function parseDateToIso(raw: string): string | null {
  const trimmed = raw.trim();

  let m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return trimmed;

  m = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  m = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
  if (m) {
    const monthIndex = MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase());
    if (monthIndex >= 0) return `${m[3]}-${pad2(monthIndex + 1)}-${pad2(Number(m[1]))}`;
  }

  m = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const monthIndex = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
    if (monthIndex >= 0) return `${m[3]}-${pad2(monthIndex + 1)}-${pad2(Number(m[2]))}`;
  }

  return null;
}

export function parseMonthToIso(raw: string): string | null {
  const trimmed = raw.trim();

  let m = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (m) return trimmed;

  m = trimmed.match(/^(\d{1,2})[/\-](\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) return `${m[2]}-${pad2(month)}`;
  }

  m = trimmed.match(/^([A-Za-z]{3,9})[\s\-,]+(\d{4})$/);
  if (m) {
    const monthIndex = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
    if (monthIndex >= 0) return `${m[2]}-${pad2(monthIndex + 1)}`;
  }

  // A poMonth candidate found via the weak "Date" alias (a proposal/issue
  // date, not strictly a month) is often a full date rather than a bare
  // month — fall back to parsing it as one and keep just the YYYY-MM part.
  const asFullDate = parseDateToIso(trimmed);
  if (asFullDate) return asFullDate.slice(0, 7);

  return null;
}

// parseNumeric (currency-prefix-tolerant numeric parsing) lives in
// contextMatcher.ts — quantityTableDetector.ts needs the exact same logic
// to parse table-cell amounts, and duplicating it here risked the two
// copies drifting apart.

const DURATION_UNIT_WORDS: Record<string, "Days" | "Weeks" | "Months"> = {
  day: "Days",
  week: "Weeks",
  month: "Months",
};

function parseDuration(raw: string): { value: number; unit: "Days" | "Weeks" | "Months" } | null {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(day|week|month)/i);
  if (!match) return null;
  const unit = DURATION_UNIT_WORDS[match[2].toLowerCase()];
  return { value: Number(match[1]), unit };
}

const DEPARTMENT_OPTIONS = ["Design Engineering Services", "Environment", "Risk Management", "Training"];
function normalizeDepartment(raw: string): string {
  const match = DEPARTMENT_OPTIONS.find((d) => d.toLowerCase() === raw.trim().toLowerCase());
  return match ?? raw.trim();
}

const WORK_ORDER_STATUS_OPTIONS = ["Received", "Yet to Receive", "Pending", "Closed", "Cancelled"];
function normalizeWorkOrderStatus(raw: string): string | null {
  const lower = raw.trim().toLowerCase();
  const exact = WORK_ORDER_STATUS_OPTIONS.find((o) => o.toLowerCase() === lower);
  if (exact) return exact;
  if (/yet to receive|not received|awaited/.test(lower)) return "Yet to Receive";
  if (/pending/.test(lower)) return "Pending";
  if (/closed|complete/.test(lower)) return "Closed";
  if (/cancel/.test(lower)) return "Cancelled";
  if (/received|issued|placed/.test(lower)) return "Received";
  return null;
}

const PROJECT_STATUS_OPTIONS = ["Active", "Ongoing", "Not Started", "Completed", "On Hold", "Cancelled"];
function normalizeProjectStatus(raw: string): string | null {
  const lower = raw.trim().toLowerCase();
  const exact = PROJECT_STATUS_OPTIONS.find((o) => o.toLowerCase() === lower);
  if (exact) return exact;
  if (/not started/.test(lower)) return "Not Started";
  if (/on\s*hold/.test(lower)) return "On Hold";
  if (/cancel/.test(lower)) return "Cancelled";
  if (/complete/.test(lower)) return "Completed";
  if (/ongoing|in progress/.test(lower)) return "Ongoing";
  if (/active/.test(lower)) return "Active";
  return null;
}

function normalizeContractType(raw: string): "LUMP SUM" | "ARC" | null {
  const lower = raw.toLowerCase();
  if (/lump/.test(lower)) return "LUMP SUM";
  if (/\barc\b|annual rate/.test(lower)) return "ARC";
  return null;
}

function normalizeCurrency(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (["INR", "USD", "AED", "OMR", "QAR", "MYR", "GBP", "EUR"].includes(trimmed)) return trimmed;
  if (/₹|RS\.?|RUPEE/i.test(raw)) return "INR";
  if (/AED|DIRHAM/i.test(raw)) return "AED";
  if (/OMR|RIAL/i.test(raw)) return "OMR";
  if (/QAR/i.test(raw)) return "QAR";
  if (/\bRM\b|RINGGIT|MYR/i.test(raw)) return "MYR";
  if (/\$/.test(raw)) return "USD";
  return null;
}

/** Generic string-in, string-out (or derived-value-out) field normalizer. Returns confidence 0 / empty warnings when nothing was found, and a warning (never a thrown error) when something was found but couldn't be interpreted. */
function normalizeField<T>(
  candidate: FieldCandidate<string>,
  transform: (raw: string) => T | null,
  emptyValue: T
): ExtractedField<T> {
  if (candidate.value === null) return { value: emptyValue, confidence: 0 };
  const transformed = transform(candidate.value);
  if (transformed === null) {
    return {
      value: emptyValue,
      confidence: confidenceForMatchType(candidate.matchType),
      warnings: [`Found "${candidate.value}" but could not interpret it — left blank for manual entry.`],
    };
  }
  return { value: transformed, confidence: confidenceForMatchType(candidate.matchType) };
}

/** Same as normalizeField, but for transforms that never fail (free-text fields like Client, EIC Name, Department). */
function passthroughField(candidate: FieldCandidate<string>, transform: (raw: string) => string = (v) => v): ExtractedField<string> {
  if (candidate.value === null) return { value: "", confidence: 0 };
  return { value: transform(candidate.value), confidence: confidenceForMatchType(candidate.matchType) };
}

/** "M/s." (and "M/s", "Mls." OCR-style variants) is an honorific prefix meaning "Messrs." — routine on Indian commercial documents, but redundant on a Client Name field that already implies it's a company. Stripped from the front only, never mid-string, so a client name that genuinely contains "M/s." later in its text is left alone. */
function stripLeadingHonorific(raw: string): string {
  return raw.replace(/^m\s*\/?\s*s\.?\s*/i, "").trim();
}

function normalizeDomesticForeign(
  domesticForeign: FieldCandidate<string>,
  prCategory: FieldCandidate<string>
): ExtractedField<string> {
  if (domesticForeign.value) {
    const lower = domesticForeign.value.toLowerCase();
    if (lower.includes("domestic")) return { value: "Domestic", confidence: confidenceForMatchType(domesticForeign.matchType) };
    if (lower.includes("foreign")) return { value: "Foreign", confidence: confidenceForMatchType(domesticForeign.matchType) };
  }
  if (prCategory.value) {
    return {
      value: prCategory.value === "India" ? "Domestic" : "Foreign",
      confidence: confidenceForMatchType("inference"),
      warnings: [`Inferred from PR Category "${prCategory.value}" — not stated directly in the document.`],
    };
  }
  return { value: "", confidence: 0 };
}

function normalizeDurationPair(candidate: FieldCandidate<string>): {
  estimatedDuration: ExtractedField<number | null>;
  durationUnit: ExtractedField<string>;
} {
  if (candidate.value === null) {
    return { estimatedDuration: { value: null, confidence: 0 }, durationUnit: { value: "Days", confidence: 0 } };
  }
  const parsed = parseDuration(candidate.value);
  const confidence = confidenceForMatchType(candidate.matchType);
  if (!parsed) {
    return {
      estimatedDuration: {
        value: null,
        confidence,
        warnings: [`Found "${candidate.value}" but could not interpret a number + unit — left blank for manual entry.`],
      },
      durationUnit: { value: "Days", confidence: 0 },
    };
  }
  return {
    estimatedDuration: { value: parsed.value, confidence },
    durationUnit: { value: parsed.unit, confidence },
  };
}

export function normalizeGeneralInformation(fields: ExtractedFields): PdfImportGeneralInformation {
  const { estimatedDuration, durationUnit } = normalizeDurationPair(fields.estimatedDurationRaw);

  return {
    poMonth: normalizeField(fields.poMonth, parseMonthToIso, ""),
    prCategory: passthroughField(fields.prCategory),
    projectTitle: passthroughField(fields.projectTitle, stripLeadingHonorific),
    client: passthroughField(fields.client, stripLeadingHonorific),
    department: passthroughField(fields.department, normalizeDepartment),
    domesticForeign: normalizeDomesticForeign(fields.domesticForeign, fields.prCategory),
    workOrderStatus: normalizeField(fields.workOrderStatus, normalizeWorkOrderStatus, ""),
    projectStatus: normalizeField(fields.projectStatus, normalizeProjectStatus, ""),
    projectStartDate: normalizeField(fields.projectStartDate, parseDateToIso, ""),
    projectEndDate: normalizeField(fields.projectEndDate, parseDateToIso, ""),
    estimatedDuration,
    durationUnit,
    workOrderNumber: passthroughField(fields.workOrderNumber),
    workOrderDate: normalizeField(fields.workOrderDate, parseDateToIso, ""),
    eicName: passthroughField(fields.eicName),
    contactNumber: passthroughField(fields.contactNumber),
    emailId: passthroughField(fields.emailId),
    contractType: normalizeField(fields.contractType, normalizeContractType, "LUMP SUM"),
    pmoCoordinator: passthroughField(fields.pmoCoordinator),
    workOrderValue: normalizeField(fields.workOrderValueRaw, parseNumeric, null),
    currency: normalizeField(fields.currency, normalizeCurrency, "INR"),
  };
}

export function normalizeQuantityRows(rows: RawQuantityRow[]): PdfImportQuantityRow[] {
  return rows.map((row) => ({
    description: { value: row.description, confidence: confidenceForMatchType(row.matchType) },
    qty: { value: parseNumeric(row.qty) ?? 0, confidence: confidenceForMatchType(row.matchType) },
    uom: { value: row.uom, confidence: confidenceForMatchType(row.matchType) },
    unitRate: { value: parseNumeric(row.unitRate) ?? 0, confidence: confidenceForMatchType(row.matchType) },
  }));
}

export function normalizeMilestones(milestones: RawMilestone[]): PdfImportMilestone[] {
  return milestones.map((m) => {
    const dueDateIso = m.dueDate ? parseDateToIso(m.dueDate) : null;
    return {
      milestoneName: { value: m.milestoneName, confidence: confidenceForMatchType(m.matchType) },
      paymentPercentage: { value: parseNumeric(m.paymentPercentage) ?? 0, confidence: confidenceForMatchType(m.matchType) },
      dueDate: dueDateIso
        ? { value: dueDateIso, confidence: confidenceForMatchType(m.matchType) }
        : { value: "", confidence: 0 },
    };
  });
}
