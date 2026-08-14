/**
 * THE FIELD ALIAS DICTIONARY — the single reusable, data-only description
 * of every General Information field this pipeline ever fills in. Nothing
 * in fieldMappingEngine.ts/contextMatcher.ts hardcodes a field's aliases or
 * label text; they only ever read this table. Adding support for a new
 * client's phrasing of an existing field (e.g. a fifth synonym for "Client")
 * is a one-line edit here, never a new function.
 *
 * `aliases[0]` is the canonical iFluids label (an exact-line match scores
 * 100%); every later entry is a synonym a *different* client/template uses
 * for the same concept (a match scores 90%, table-match, or context-match
 * — see contextMatcher.ts). `weakAliases` are single, generic words
 * ("Date", "Status") that are too ambiguous to trust at full synonym
 * confidence even when they do match a label pattern — capped at
 * context-match (70%) instead of strong-label (90%).
 */

export type FieldDataType = "string" | "date" | "month" | "number" | "enum";

export interface FieldMappingRule {
  /** Key into ExtractedFields / NormalizedGeneralInformation. */
  targetField: string;
  /** Human label used in warnings ("Client Name is required..."). */
  label: string;
  /** aliases[0] = canonical label; rest = synonyms from other templates/clients. */
  aliases: string[];
  /** Ambiguous single-word aliases — capped at context-match even on a label-shaped match. */
  weakAliases?: string[];
  /** Canonical section names (see sectionDetector.ts) this field is normally found in. Searched first, before falling back to the whole (non-ignored) document. */
  sectionHints?: string[];
  dataType: FieldDataType;
  /** For dataType "enum" — the fixed set of values GeneralInfoCard's own dropdown offers. */
  enumOptions?: readonly string[];
  /** For dataType "enum" — canonical option -> extra keywords/phrases that also mean it (case-insensitive substring match). */
  enumSynonyms?: Record<string, string[]>;
  /** Currency-style symbol/code detection — canonical option -> regex to spot it near a number, with no label at all. */
  symbolPatterns?: Record<string, RegExp>;
  /** A label-free fallback pattern (email, phone) tried only if no aliased match is found anywhere. */
  bareRegex?: RegExp;
  /**
   * A label-free, section-scoped pattern for values a document states in
   * prose rather than a Label:Value pair (e.g. "The duration of the
   * project will be Two (02) Weeks." under a Schedule heading, with no
   * "Duration:" label anywhere) — scored as context-match. `combine` lets
   * the matched value be reassembled from more than one capture group
   * (skipping stray punctuation like the "(" ")" around a duration digit).
   */
  contextPattern?: { pattern: RegExp; combine?: (match: RegExpMatchArray) => string };
  /**
   * Weakest possible signal — the enum option's own name appears anywhere
   * in the document at all (e.g. a region name in a letterhead address),
   * tried only once every stronger strategy has found nothing. Scored as
   * "inference" (40%), never higher.
   */
  inferByMention?: boolean;
  /** Routed into PdfImportResponse.unmappedFields instead of generalInformation — never auto-filled, per business rule (PO Number). */
  neverAutoFill?: boolean;
  /**
   * This field must never be filled with iFluids' OWN contact details —
   * see companyIdentity.ts. Every candidate value (label match or bare
   * regex) is checked and skipped in favor of the next one if it's a known
   * company email/phone/website/GSTIN, no matter which section it came
   * from (a repeated page footer isn't confined to one section).
   */
  excludeIfOwnCompany?: "email" | "phone" | "any";
  /**
   * Business-knowledge fallback (see pmoKnowledgeBase.ts) — tried only
   * once every label-based strategy has found nothing, scanning the
   * Scope of Work text for a domain keyword ("HAZOP", "QRA", "SIL"...) and
   * mapping it to this field's value via the shared knowledge base.
   * Scored as "inference" (40%) — a business rule, not something the
   * document stated directly.
   */
  useKnowledgeBase?: boolean;
  /**
   * This field's own scope-of-work derivation fallback — see
   * fieldMappingEngine.ts's `deriveProjectTitleFromScope`. Currently only
   * meaningful for Project Title; the flag exists (rather than the engine
   * checking `targetField === "projectTitle"`) so the engine's resolver
   * never mentions a field's name directly.
   */
  deriveFromScope?: boolean;
  /**
   * This field's value follows from the document TYPE itself by iFluids'
   * own convention (see templateProfiles.ts's `inferredContractType`) —
   * tried only once every stronger strategy has found nothing. Currently
   * only meaningful for Contract Type.
   */
  useDocTypeInference?: boolean;
}

export const PR_CATEGORY_OPTIONS = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;

export const WORK_ORDER_STATUS_OPTIONS = ["Received", "Yet to Receive", "Pending", "Closed", "Cancelled"] as const;

export const PROJECT_STATUS_OPTIONS = ["Active", "Ongoing", "Not Started", "Completed", "On Hold", "Cancelled"] as const;

export const CONTRACT_TYPE_OPTIONS = ["LUMP SUM", "ARC"] as const;

export const DEPARTMENT_OPTIONS = ["Design Engineering Services", "Environment", "Risk Management", "Training"] as const;

export const FIELD_MAPPING_CONFIG: FieldMappingRule[] = [
  {
    targetField: "poMonth",
    label: "PO Month",
    aliases: ["PO Month", "Purchase Order Month", "Proposal Date"],
    weakAliases: ["Date"],
    sectionHints: ["client details", "project details"],
    dataType: "month",
  },
  {
    targetField: "prCategory",
    label: "PR Category",
    aliases: ["PR Category", "Region"],
    sectionHints: ["client details", "project details"],
    dataType: "enum",
    enumOptions: PR_CATEGORY_OPTIONS,
    inferByMention: true,
  },
  {
    targetField: "client",
    label: "Client Name",
    aliases: ["Client Name", "Client", "Customer", "Employer", "Owner", "Purchaser", "M/s"],
    sectionHints: ["client details", "project details"],
    dataType: "string",
    excludeIfOwnCompany: "any",
  },
  {
    targetField: "projectTitle",
    label: "Project Title",
    aliases: ["Project Title", "Subject", "Scope of Work", "Re"],
    sectionHints: ["project details", "scope of work"],
    dataType: "string",
    deriveFromScope: true,
  },
  {
    targetField: "department",
    label: "Department",
    aliases: ["Department", "Dept"],
    sectionHints: ["project details", "client details"],
    dataType: "enum",
    enumOptions: DEPARTMENT_OPTIONS,
    useKnowledgeBase: true,
  },
  {
    targetField: "domesticForeign",
    label: "Domestic / Foreign",
    aliases: ["Domestic / Foreign", "Domestic/Foreign", "Domestic or Foreign"],
    sectionHints: ["project details", "client details"],
    dataType: "enum",
    enumOptions: ["Domestic", "Foreign"],
  },
  {
    targetField: "workOrderStatus",
    label: "Work Order Status",
    aliases: ["Work Order Status", "WO Status"],
    weakAliases: ["Status"],
    sectionHints: ["project details", "commercial details"],
    dataType: "enum",
    enumOptions: WORK_ORDER_STATUS_OPTIONS,
    enumSynonyms: {
      "Yet to Receive": ["yet to receive", "not received", "awaited"],
      Pending: ["pending"],
      Closed: ["closed", "complete"],
      Cancelled: ["cancel"],
      Received: ["received", "issued", "placed"],
    },
  },
  {
    targetField: "projectStatus",
    label: "Project Status",
    aliases: ["Project Status"],
    sectionHints: ["project details"],
    dataType: "enum",
    enumOptions: PROJECT_STATUS_OPTIONS,
    enumSynonyms: {
      "Not Started": ["not started"],
      "On Hold": ["on hold", "on-hold"],
      Cancelled: ["cancel"],
      Completed: ["complete"],
      Ongoing: ["ongoing", "in progress"],
      Active: ["active"],
    },
  },
  {
    targetField: "projectStartDate",
    label: "Project Start Date",
    aliases: ["Project Start Date", "Start Date", "Commencement Date", "Order Date"],
    sectionHints: ["project details", "commercial details"],
    dataType: "date",
  },
  {
    targetField: "projectEndDate",
    label: "Project End Date",
    aliases: ["Project End Date", "End Date", "Completion Date"],
    sectionHints: ["project details"],
    dataType: "date",
  },
  {
    targetField: "estimatedDurationRaw",
    label: "Estimated Duration",
    aliases: ["Estimated Duration", "Duration", "Contract Period", "Project Duration"],
    sectionHints: ["project details", "schedule"],
    dataType: "string",
    contextPattern: {
      // "Two (02) Weeks" / "02 Weeks" / "2 Months" — tolerates stray
      // punctuation (the "(" ")" around a spelled-out-then-numeric duration)
      // between the digits and the unit word.
      pattern: /(\d+)\)?\s*(days?|weeks?|months?)/i,
      combine: (m) => `${m[1]} ${m[2]}`,
    },
  },
  {
    targetField: "workOrderNumber",
    label: "Work Order Number",
    aliases: ["Work Order Number", "Work Order No", "WO No", "WO Number", "W.O. Number"],
    sectionHints: ["project details", "commercial details"],
    dataType: "string",
  },
  {
    targetField: "workOrderDate",
    label: "Work Order Date",
    aliases: ["Work Order Date", "WO Date"],
    weakAliases: ["Dated"],
    sectionHints: ["project details", "commercial details"],
    dataType: "date",
  },
  {
    targetField: "eicName",
    label: "EIC Name",
    aliases: ["EIC Name", "Engineer In Charge", "EIC", "Client Contact", "Contact Person", "Attention", "Kind Attn"],
    sectionHints: ["client details", "project details"],
    dataType: "string",
  },
  {
    targetField: "contactNumber",
    label: "Contact Number",
    aliases: ["Contact Number", "Phone", "Tel", "Mobile"],
    sectionHints: ["client details"],
    dataType: "string",
    bareRegex: /(\+?\d[\d\s-]{8,15}\d)/,
    excludeIfOwnCompany: "phone",
  },
  {
    targetField: "emailId",
    label: "Email ID",
    aliases: ["Email ID", "Email", "E-mail"],
    sectionHints: ["client details"],
    dataType: "string",
    bareRegex: /([\w.-]+@[\w.-]+\.\w{2,})/,
    excludeIfOwnCompany: "email",
  },
  {
    targetField: "contractType",
    label: "Contract Type",
    aliases: ["Contract Type"],
    sectionHints: ["commercial details"],
    dataType: "enum",
    enumOptions: CONTRACT_TYPE_OPTIONS,
    enumSynonyms: {
      "LUMP SUM": ["lump sum", "lump-sum", " ls "],
      ARC: ["annual rate contract", "\\barc\\b"],
    },
    useDocTypeInference: true,
  },
  {
    targetField: "pmoCoordinator",
    label: "PMO Coordinator",
    aliases: ["PMO Coordinator", "Coordinator"],
    sectionHints: ["project details"],
    dataType: "string",
  },
  {
    targetField: "currency",
    label: "Currency",
    aliases: ["Currency"],
    sectionHints: ["commercial details"],
    dataType: "enum",
    enumOptions: ["INR", "USD", "AED", "OMR", "QAR", "MYR", "GBP", "EUR"],
    symbolPatterns: {
      INR: /(?:₹|INR|Rs\.?)\s?[\d,]/,
      AED: /AED\s?[\d,]/,
      OMR: /OMR\s?[\d,]/,
      QAR: /QAR\s?[\d,]/,
      MYR: /(?:RM|MYR)\s?[\d,]/,
      USD: /\$\s?[\d,]/,
    },
  },
  {
    targetField: "workOrderValueRaw",
    label: "Work Order Value",
    aliases: ["Work Order Value", "Total Value", "Contract Value", "Total Amount", "WO Value", "Total Cost", "Total Cost (INR)"],
    sectionHints: ["commercial details", "quantity schedule"],
    dataType: "number",
  },
  {
    targetField: "poNumber",
    label: "PO Number",
    aliases: ["PO Number", "Purchase Order Number", "P.O. Number", "PO No"],
    dataType: "string",
    neverAutoFill: true,
  },
  {
    targetField: "remarks",
    label: "Remarks",
    aliases: ["Remarks", "Special Instructions", "Notes"],
    dataType: "string",
    neverAutoFill: true,
  },
];
