import type { QuantityItem } from "./QuantityItem";
import type { ManhourExpense } from "./ManhourExpense";
import type { NonManhourExpense } from "./NonManhourExpense";
import type { InvoiceGstSelection, InvoiceItem, InvoiceMethod } from "./InvoiceItem";
import type { QuantityRevision } from "./QuantityRevision";
import type { ProjectNote } from "./ProjectNote";
import type { TimesheetImportMonth } from "./Timesheet";
import type { InvoiceDocumentDetails } from "./InvoiceDocument";

export interface Project {
  id: string;

  // ==========================
  // GENERAL INFORMATION
  // ==========================

  poMonth: string;

  prCategory: string;

  prNo: string;
  /** RFQ No. — required on the General tab; absent on projects created before the field existed. */
  rfqNo?: string;
  client: string;
  department: string;
  domesticForeign: string;
  projectTitle: string;

  workOrderStatus: string;
  projectStartDate: string;
  projectEndDate: string;
  projectStatus: string;

  // Formal Project Completion Fields
  actualCompletionDate?: string;
  completionRemarks?: string;
  completedBy?: string;
  completedTimestamp?: string;

  // Liquidated Damages (Oct 2026) — recorded once at completion by the
  // backend (projectCompletion.rules.ts). ldApplicable null/undefined = not
  // recorded (completed before this feature) — never treated as "No".
  ldApplicable?: boolean | null;
  ldAmountINR?: number | null;
  // Regional LD (Phase 4 final): a non-INR project's LD is recorded in its own currency (ldAmountRegional + ldCurrency); ldAmountINR stays for an INR project.
  // A recorded amount with no ldCurrency is a legacy rupee record, never read as regional.
  ldCurrency?: string | null;
  ldAmountRegional?: number | null;
  ldRemarks?: string | null;
  ldRecordedByUserId?: string | null;
  ldRecordedAt?: string | null;

  // Work Order Details
  workOrderNumber?: string;
  workOrderDate?: string;
  eicName?: string;
  contactNumber?: string;
  emailId?: string;

  // Project Scheduling
  estimatedDuration?: number;
  durationUnit?: "Days" | "Weeks" | "Months";

  // ==========================
  // QUANTITY INFORMATION
  // ==========================

  quantityItems: QuantityItem[];

  totalWOQty: number;
  totalInvoiceQty: number;
  totalPendingQty: number;

  pendingAmount: number;
  pendingInvoicePercentage: number;

  // ==========================
  // GST / COMMERCIAL SUMMARY (Quantity Details)
  // ==========================

  gstApplicable: boolean;
  gstRate: number;
  gstAmount: number;
  grandTotal: number;

  // ==========================
  // COMMERCIAL INFORMATION
  // ==========================

  contractFormalities: string;

  paymentTerms: string;

  currency: string;

  contractExchangeRate: number;

  currentExchangeRate: number;

  workOrderValue: number;

  workOrderValueINR: number;

  // Regional currency (Phase 3): the currency of the project's country, a snapshot the backend takes at creation. null / absent = a legacy
  // project, treated as INR everywhere. `currency` above is the commercial (transaction) currency; the rate is regional currency per one
  // unit of it. workOrderValueRegional / grandTotalRegional are the work order value in the regional currency (equal to the INR figures for
  // an INR or legacy project).
  regionalCurrency?: string | null;
  workOrderValueRegional?: number;
  grandTotalRegional?: number;
  // Project Tax (Nov 2026), outside India only - see utils/projectTax.ts. taxMode is the server's verdict for the saved record and
  // taxModeCategory the PR Category it was given for. null = Not Set; undefined = this browser does not know it (never sent on save).
  // Tax Amount and Grand Total are derived on screen and stored nowhere. India keeps gstApplicable / gstRate / gstAmount / grandTotal.
  taxMode?: "GST" | "TAX";
  taxModeCategory?: string;
  taxApplicable?: boolean | null;
  taxRatePercent?: number | null;
  backendWorkOrderValueRegional?: number;
  backendPendingDueRegional?: number;
  /** Phase 4 / Option A: PENDING / FAILED while the automatic manpower recalculation after an employee-rate change has not completed for this project. */
  manhourRefreshStatus?: "CURRENT" | "PENDING" | "FAILED";

  // Work Order Value / Pending Due — Aug 2026 bug fix. Server-computed
  // fallback aggregate from GET/POST/PATCH /projects (see Backend's
  // ProjectDto), carried through untouched by normalizeProject()'s own
  // recompute. Used ONLY when this project's real quantityItems/invoiceItems
  // haven't been loaded into this browser yet (e.g. the Project Repository
  // list, before Edit Project has ever been opened here) — see
  // normalizeProject() in projectService.ts and getProjectCommercialSummary()
  // in invoiceProgressService.ts for where each is consumed. Never a second
  // source of truth once the real item arrays ARE populated.
  backendWorkOrderValueINR?: number;
  backendPendingDueINR?: number;
  // True when every non-Cancelled invoice has actually reached "Paid" — the Project Repository shows "Paid" only with this.
  backendAllInvoicesPaid?: boolean;
  // Server-authoritative expense totals (Oct 2026) — SUM(resource manhourCost)
  // and SUM(active expense totalCost) from the project list/detail API, so
  // list screens (Completed Projects) never compute profit from the cache.
  backendManhourCostINR?: number;
  backendNonManhourCostINR?: number;
  // Invoice Request indicator (Oct 2026) — whether this project currently
  // has an Open InvoiceRequest. Deliberately independent of, and never
  // feeding into, the Invoice Status calculation below (Not Started /
  // Raised / Partially Paid / Paid, still derived client-side exactly as
  // before from workOrderValueINR/backendPendingDueINR) — this flag only
  // drives Project Repository's small, separate "+" indicator beside the
  // unchanged status badge. See Backend's ProjectDto for how it's computed.
  hasOpenInvoiceRequest?: boolean;
  // Invoice Currency feature (Oct 2026) — the backend's persisted invoice-
  // currency lock (ProjectDto.invoiceCurrency), separate from `currency`
  // (Quantity Details' pricing currency). undefined = the backend doesn't
  // report it (older backend, or a never-synced local project) and USD
  // invoicing is not offered; null = backend supports it, nothing locked
  // yet. See Invoice/invoiceCurrency.ts's isInvoiceCurrencySupported().
  invoiceCurrency?: string | null;
  /**
   * Invoice-level GST snapshot (Nov 2026) — TRANSIENT, never stored: the rate / tax type the user chose for a NEW invoice about to be
   * raised, keyed by the invoice number upper-cased and trimmed. A Raise / Edit Invoice screen attaches it to the project it hands to
   * onSave(); invoiceLineActions.ts's persistInvoiceProjectChange() takes it off before anything is saved locally and sends it to the
   * server with the write that raises the invoice. The server then freezes it in the invoice's GST snapshot.
   */
  invoiceGstSelections?: Record<string, InvoiceGstSelection>;
  /** Administrative Controls (Invoice Administration holders): raise the invoices in this save without the automatic "invoice raised" email. Transient, never stored. */
  invoiceSuppressEmail?: boolean;

  contractType: string;

  // ==========================
  // PAYMENT MILESTONES
  // ==========================

  paymentType: "Single" | "Multiple";

  paymentMilestones: {
    id: string;
    milestoneName?: string;
    paymentPercentage: number;
    dueDate: string;
    amount: number;
  }[];

  // ==========================
  // INVOICE INFORMATION
  // ==========================

  invoiceMethod?: InvoiceMethod;

  invoiceItems: InvoiceItem[];

  quantityRevisions?: QuantityRevision[];

  paymentReceived: number;
  paymentReceivedINR: number;

  // ==========================
  // EXPENSE INFORMATION
  // ==========================

  manhourExpenses: ManhourExpense[];

  nonManhourExpenses: NonManhourExpense[];

  // ==========================
  // DOCUMENT INFORMATION
  // ==========================

  reportLink: string;
  completionCertificate: string;
  projectCompletionDate: string;

  // ==========================
  // PROJECT TEAM
  // ==========================

  primaryProjectManager: string;
  secondaryProjectManager: string;
  projectEngineer: string;
  projectCoordinator: string;
  pmoCoordinator?: string;
  /** The assigned PMO Coordinator ACCOUNT, from the backend (null/absent = legacy text-only coordinator). */
  pmoCoordinatorUserId?: string | null;
  /** Form-only: the registry entry picked in General Information this session; sent so the backend can validate and link it. */
  pmoCoordinatorEntryId?: string;
  clientCoordinator: string;

  resources: ProjectResource[];

  timesheetMonths?: TimesheetImportMonth[];
  latestTimesheetMonth?: string;

  totalHoursBudget?: number;
  totalProjectBudget?: number;

  lastImportedDate?: string;
  lastImportedBy?: string;
  lastImportedRowsCount?: number;

  // ==========================
  // EXPENSE BUDGET INFORMATION
  // ==========================
  manhourBudgetAmount?: number;
  manhourBudgetHours?: number;
  manhourBudgetRemarks?: string;
  // null = Non Man-Hour Budget not entered; 0 = explicitly entered as zero (the weekly missing-expenses email depends on the difference).
  nonManhourBudgetAmount?: number | null;
  nonManhourBudgetRemarks?: string;

  clientReferenceNo: string;
  remarks: string;

  // ==========================
  // AUDIT
  // ==========================

  createdAt?: string;
  updatedAt?: string;

  // Archive (soft-delete) — populated from the backend for the Archived
  // Projects page; absent/false for every normal (non-archived) project.
  isDeleted?: boolean;
  deletedAt?: string | null;

  // Project-ownership authorization — null for every project created before
  // this field existed (treated as accessible to every normal user) or for
  // any project created by someone else once role-based UI ever needs to
  // distinguish that. Never sent by the client; set server-side only.
  createdByUserId?: string | null;

  notes?: ProjectNote[];
  invoiceDocumentDetailsMap?: Record<string, InvoiceDocumentDetails>;
}

export interface ProjectResource {
  id: string;
  employeeNo: string;
  employeeName: string;
  reportingManager: string;
  department: string;
  designation: string;
  startDate: string;
  endDate: string;
  hourlyRateSnapshot?: number;
  workingDays: number;
  totalHours: number;
  /** INR, exactly as before (hours x the employee's frozen INR rate). */
  manhourCost?: number;
  /**
   * Phase 4 - regional costing of manhourCost, from the backend. costingStatus: INR (no conversion) | CONVERTED | RATE_MISSING; null/absent on a row saved before
   * Phase 4 (an INR project needs none; on a non-INR project that means "Rate not set"). manhourCostRegional is in costCurrency and only set when CONVERTED.
   */
  costCurrency?: string | null;
  costingStatus?: string | null;
  fxRateVersion?: number | null;
  fxRateInrPerRegional?: number | null;
  manhourCostRegional?: number | null;
  status: "Active" | "Released";
  location?: string;
}