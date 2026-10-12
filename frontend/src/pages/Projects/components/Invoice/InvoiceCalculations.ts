import type { InvoiceCurrency, InvoiceItem, InvoiceLine, InvoiceLineStatus, InvoiceMethod } from "../../../../types/InvoiceItem";
import type { Project } from "../../../../types/Project";
import type { Tone } from "../../../../components/ui/Badge";
import {
  getInvoiceRaisedAmount,
  getInvoiceStatus,
  getProjectCommercialSummary,
  type InvoiceStatus,
} from "../../../../services/invoiceProgressService";

export type { InvoiceStatus };

/**
 * This file is the Invoice Calculation Service — the ONLY place invoice,
 * milestone, and billing figures are computed. Components must call one of
 * the functions here (or the public API grouped at the bottom of this file)
 * rather than re-deriving a formula inline. `round` is exported so any
 * caller that still needs to combine a raw number (e.g. a form input) rounds
 * the exact same way as every other figure in the app — no second rounding
 * idiom anywhere else.
 */
export const round = (value: number): number => Math.round(value * 100) / 100;

export interface BillingMilestone {
  id: string;
  label: string;
  percent: number;
}

export function getMilestonesForProject(project: Project): BillingMilestone[] {
  const milestones = project.paymentMilestones ?? [];
  const effective = project.paymentType === "Single" ? milestones.slice(0, 1) : milestones;

  return effective.map((milestone, index) => ({
    id: milestone.id,
    label: milestone.milestoneName?.trim() || `Milestone ${index + 1}`,
    percent: milestone.paymentPercentage || 0,
  }));
}

export function findMilestone(milestones: BillingMilestone[], milestoneId: string | undefined): BillingMilestone | undefined {
  if (!milestoneId) return undefined;
  return milestones.find((m) => m.id === milestoneId);
}

/**
 * Single Source of Truth for Quantity Progress — always derived from saved,
 * non-cancelled invoice lines, never a separate PM/Quantity-module field,
 * never re-derived from Milestone Summary, never temporary UI state. The
 * aggregation differs by billing mode because Qty Invoiced means a
 * different thing in each:
 *  - No milestones configured (plain quantity-driven billing): every
 *    invoice bills a distinct, non-overlapping chunk of the shared qty pool
 *    (e.g. 20 Packages this month, 30 more next month) — the running SUM is
 *    the completed qty.
 *  - Milestones configured (Qty + Milestone billing): Qty to Invoice
 *    represents the ACTUAL completed units as of that milestone payment,
 *    and the same completed units are legitimately re-cited at every
 *    milestone (Draft/Final/Closure all bill the same "1 NOS", just at
 *    different payment %). Summing across milestones would triple-count
 *    the same work — the highest qty ever attested across all of this
 *    activity's invoices is the current best-known completion state.
 */
export function getActivityCompletedQty(item: InvoiceItem, milestones: BillingMilestone[]): number {
  const lines = (Array.isArray(item.invoices) ? item.invoices : []).filter((line) => line.status !== "Cancelled");

  if (milestones.length > 0) {
    return lines.reduce((max, line) => Math.max(max, line.quantityBilled || 0), 0);
  }

  return round(lines.reduce((sum, line) => sum + line.quantityBilled, 0));
}

/** Always the complement of Completed Qty — Remaining = Contract Qty − Completed Qty — so the two never drift apart or contradict each other. */
export function getActivityRemainingQty(item: InvoiceItem, milestones: BillingMilestone[]): number {
  return Math.max(round(item.qty - getActivityCompletedQty(item, milestones)), 0);
}

/** Milestone Value = Work Order Value × Milestone % — the ONE formula for this, shared by Raise Invoice and Invoice History. Never re-derive this inline. */
export function getMilestoneValue(totalPrice: number, milestonePercent: number): number {
  return round(totalPrice * (milestonePercent / 100));
}

/**
 * System Amount = Qty to Invoice × Unit Rate × Milestone % — Qty to Invoice
 * is the ACTUAL completed units this invoice references (never derived from
 * the milestone %, never a fraction like 0.4 or 0.5), and the milestone %
 * scales that into what this specific payment stage is worth. For
 * non-milestone lines, milestonePercent is always 100 (a no-op factor), so
 * this is also the correct formula for plain quantity-driven billing.
 * Computed once when an invoice is saved and persisted on the line
 * (InvoiceLine.calculatedAmountINR) — never recalculated live afterwards,
 * so a later change to the milestone % or unit rate never rewrites the
 * history of what was actually billed.
 */
export function getSystemAmount(qty: number, unitPrice: number, milestonePercent: number): number {
  return round(qty * (unitPrice || 0) * (milestonePercent / 100));
}

/** Commercial Adjustment = Invoice Amount (as entered/edited) − System-Calculated Amount. The ONE formula for this, shared by create and edit flows. */
export function getCommercialAdjustment(invoiceAmount: number, calculatedAmount: number): number {
  return round(invoiceAmount - calculatedAmount);
}

/** Sum of Quantity Consumed (InvoiceLine.quantityBilled) already invoiced against one milestone — or, when milestoneId is undefined, against the "no milestone" bucket (custom/plain quantity-driven lines). Excludes Cancelled lines and, for an edit in progress, the line being edited. */
export function getPreviousBilledQtyForMilestone(
  item: InvoiceItem,
  milestoneId?: string,
  excludeLineId?: string
): number {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  return round(
    lines
      .filter(
        (line) =>
          line.status !== "Cancelled" &&
          line.id !== excludeLineId &&
          (milestoneId ? line.milestoneId === milestoneId : !line.milestoneId)
      )
      .reduce((sum, line) => sum + (line.quantityBilled || 0), 0)
  );
}

export interface MilestoneQuantityState {
  /** The qty ceiling for this scope — always Contract Qty. Qty to Invoice represents actual completed units, never a milestone-%-derived fraction of it, so the ceiling is the same Contract Qty whichever milestone (or none) this row references. */
  ceiling: number;
  /** Qty already invoiced within this exact scope (this milestone, or the no-milestone bucket), excluding Cancelled lines and excludeLineId. */
  alreadyInvoiced: number;
  /** ceiling − alreadyInvoiced, floored at 0 — the maximum Qty to Invoice allowed right now. */
  available: number;
}

/**
 * Single source of truth for "how much quantity can still be invoiced right
 * now". Each milestone keeps its OWN independent ledger against the full
 * Contract Qty — invoicing Qty 1 against "Draft" never reduces what's
 * available for "Final" or "Closure" on the same activity (they're separate
 * payment stages for the same completed work, not separate slices of
 * quantity) — but invoicing "Draft" a second time for the same qty is
 * rejected once its own ledger is exhausted. Plain quantity-driven rows
 * (milestoneId undefined) share one pool across every invoice on the
 * activity, since there's no milestone to keep a separate ledger for. The
 * UI and validation must both read `available` from here rather than
 * re-deriving it.
 */
export function getMilestoneQuantityState(
  item: InvoiceItem,
  milestoneId: string | undefined,
  excludeLineId?: string
): MilestoneQuantityState {
  const ceiling = item.qty;
  const alreadyInvoiced = getPreviousBilledQtyForMilestone(item, milestoneId, excludeLineId);
  const available = Math.max(round(ceiling - alreadyInvoiced), 0);
  return { ceiling, alreadyInvoiced, available };
}

export function getPreviousRaisedAmountForMilestone(
  item: InvoiceItem,
  milestoneId?: string,
  excludeLineId?: string
): number {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  return round(
    lines
      .filter(
        (line) =>
          line.status !== "Cancelled" &&
          line.id !== excludeLineId &&
          (milestoneId ? line.milestoneId === milestoneId : !line.milestoneId)
      )
      .reduce((sum, line) => sum + (line.invoiceAmountINR || 0), 0)
  );
}

export type CommercialLineBillingStatus =
  | "Not Eligible"
  | "Eligible"
  | "Partially Billed"
  | "Fully Billed";

export function getCommercialBillingStatus(
  _completedQty: number,
  eligibleAmount: number,
  totalBilledAmount: number
): CommercialLineBillingStatus {
  if (eligibleAmount <= 0) return "Not Eligible";
  if (totalBilledAmount >= eligibleAmount - 0.01) return "Fully Billed";
  if (totalBilledAmount > 0) return "Partially Billed";
  return "Eligible";
}

/**
 * The Raise Invoice drawer's two display layouts. Determined by ONE fact,
 * never a keyword guess about the activity's description/UOM: does this
 * project have payment milestones configured at all?
 *  - Milestones configured (Billing Type = "Qty + Milestone"): every
 *    activity on the project bills the same way — Accounts manually enters
 *    the actual completed Qty to Invoice (never auto-filled, never a
 *    milestone-%-derived fraction), and the milestone % scales that qty ×
 *    unit rate into what this payment stage is worth (getSystemAmount).
 *  - No milestones configured (Billing Type = "Quantity"): Accounts enters
 *    Bill Qty directly against the Available Qty pool — unrelated to any
 *    milestone %, since there isn't one.
 * This is the ONLY classifier for invoice layout/formula — there is no
 * second, activity-level classifier that could disagree with it.
 */
export type InvoiceWorkflowMode = "quantity_driven" | "commercial_milestone";

export function getInvoiceWorkflowMode(milestones: BillingMilestone[]): InvoiceWorkflowMode {
  return milestones.length > 0 ? "commercial_milestone" : "quantity_driven";
}

/**
 * Project-wide Invoice Method — Lump Sum (Payment Milestone % of Contract
 * Value, no quantity at all) vs Invoice Line Items (today's existing
 * quantity-driven / commercial-milestone workflow above, untouched).
 * Undefined means Accounts hasn't explicitly chosen one yet — callers must
 * treat that as "no invoice workflow to show" rather than silently
 * defaulting to Lump Sum.
 */
export function getInvoiceMethod(project: Project): InvoiceMethod | undefined {
  if (
    project.invoiceMethod === "invoice_line_items" ||
    project.invoiceMethod === "lump_sum" ||
    project.invoiceMethod === "mlmp" ||
    project.invoiceMethod === "amount_based"
  ) {
    return project.invoiceMethod;
  }

  // Bug fix (Aug 2026) — invoiceMethod is a frontend-only preference (never
  // persisted to the backend, see this file's own "not stored" note
  // elsewhere), so it only ever survives in the browser/session that
  // originally chose it. Any other session opening an already-invoiced
  // project — including, since PMO Manager now sees every user's projects,
  // a PMO Manager opening a project a different user set up billing for —
  // saw real invoice history silently hidden behind "Select an Invoice
  // Method," even though project.invoiceItems (loaded fresh from the
  // backend on every Edit Project open) already has it. Once any real,
  // non-cancelled invoice line has actually been raised, infer
  // "invoice_line_items" — the original, default, by far most common
  // workflow — instead of asking again. A genuinely never-invoiced project
  // still shows the selector unchanged.
  const hasRealInvoiceHistory = (project.invoiceItems ?? []).some(
    (item) => Array.isArray(item.invoices) && item.invoices.length > 0
  );
  return hasRealInvoiceHistory ? "invoice_line_items" : undefined;
}

export interface LumpSumMilestoneRow {
  id: string;
  label: string;
  percent: number;
  /** Contract Value × Milestone % — the amount this milestone bills, automatically, no manual entry. */
  invoiceAmount: number;
  /** True once this activity already has a non-cancelled invoice line against this milestone — it cannot be billed again. */
  alreadyInvoiced: boolean;
  status: "Completed" | "Pending";
}

/**
 * One row per Payment Milestone for this activity's Lump Sum invoice
 * checkbox list. A milestone already billed for this activity (any
 * non-cancelled line referencing it) is locked as "Completed" — Accounts
 * cannot select it again, matching "Completed milestones should not be
 * invoiced again."
 */
export function getLumpSumMilestoneRows(item: InvoiceItem, milestones: BillingMilestone[]): LumpSumMilestoneRow[] {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];

  return milestones.map((milestone) => {
    const alreadyInvoiced = lines.some((line) => line.milestoneId === milestone.id && line.status !== "Cancelled");
    return {
      id: milestone.id,
      label: milestone.label,
      percent: milestone.percent,
      invoiceAmount: getMilestoneValue(item.totalPrice, milestone.percent),
      alreadyInvoiced,
      status: alreadyInvoiced ? "Completed" : "Pending",
    };
  });
}

export interface LumpSumSummary {
  contractValue: number;
  /** Sum of every already-saved (non-cancelled) invoice amount for this activity, across all milestones. */
  alreadyInvoicedAmount: number;
  /** Sum of the currently-checked, not-yet-saved milestone amounts. */
  selectedAmount: number;
  /** alreadyInvoicedAmount + selectedAmount — what Accounts is about to have invoiced once this is saved. */
  currentTotalInvoiced: number;
  remainingAmount: number;
}

/** Live summary for the Lump Sum drawer — recomputes instantly as checkboxes change; nothing here is stored until Save. */
export function getLumpSumSummary(
  item: InvoiceItem,
  rows: LumpSumMilestoneRow[],
  selectedIds: ReadonlySet<string>
): LumpSumSummary {
  const contractValue = item.totalPrice;
  const alreadyInvoicedAmount = getInvoiceRaisedAmount(item);
  const selectedAmount = round(
    rows.filter((row) => !row.alreadyInvoiced && selectedIds.has(row.id)).reduce((sum, row) => sum + row.invoiceAmount, 0)
  );
  const currentTotalInvoiced = round(alreadyInvoicedAmount + selectedAmount);
  const remainingAmount = Math.max(round(contractValue - currentTotalInvoiced), 0);

  return { contractValue, alreadyInvoicedAmount, selectedAmount, currentTotalInvoiced, remainingAmount };
}

export interface ProjectLumpSumMilestoneRow {
  id: string;
  label: string;
  percent: number;
  /** Milestone % × the project's TOTAL Work Order Value (sum of every activity's totalPrice) — a project-wide amount, never a single activity's own totalPrice. */
  invoiceAmount: number;
  alreadyInvoiced: boolean;
  /** The invoiceNo this milestone was already billed under, if any — undefined when not yet invoiced anywhere in the project. */
  invoicedUnderInvoiceNo?: string;
  /** "Invoice 1" / "Invoice 2" ... — the human label for invoicedUnderInvoiceNo. */
  invoicedUnderCycleLabel?: string;
}

/**
 * One row per Payment Milestone for the project-wide Lump Sum "Raise
 * Invoice" checklist — the Lump Sum equivalent of the unified qty-based
 * workspace's per-activity rows, but scoped to the whole project rather
 * than one activity. A milestone can be billed EXACTLY ONCE across the
 * project's entire lifetime, never per-cycle (unlike quantity billing):
 * once ANY activity has a non-cancelled line referencing a milestone, it
 * is locked everywhere except the very cycle it was billed under — the
 * caller compares `invoicedUnderInvoiceNo` against whichever cycle is
 * currently being composed to decide locked-vs-editable, exactly like
 * reopening an existing cycle should let you review/undo what you already
 * selected, not block you from your own invoice.
 */
export function getProjectLumpSumMilestoneRows(project: Project): ProjectLumpSumMilestoneRow[] {
  const milestones = getMilestonesForProject(project);
  const items = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];
  const totalWorkOrderValue = round(items.reduce((sum, item) => sum + (item.totalPrice || 0), 0));
  const cycles = getInvoiceCyclesForProject(project);

  return milestones.map((milestone) => {
    let invoicedUnderInvoiceNo: string | undefined;
    for (const item of items) {
      const line = (Array.isArray(item.invoices) ? item.invoices : []).find(
        (l) => l.milestoneId === milestone.id && l.status !== "Cancelled"
      );
      if (line) {
        invoicedUnderInvoiceNo = line.invoiceNo;
        break;
      }
    }
    const invoicedCycle = invoicedUnderInvoiceNo ? cycles.find((c) => c.invoiceNo === invoicedUnderInvoiceNo) : undefined;

    return {
      id: milestone.id,
      label: milestone.label,
      percent: milestone.percent,
      invoiceAmount: getMilestoneValue(totalWorkOrderValue, milestone.percent),
      alreadyInvoiced: !!invoicedUnderInvoiceNo,
      invoicedUnderInvoiceNo,
      invoicedUnderCycleLabel: invoicedCycle?.label,
    };
  });
}

// =============================================================================
// MLMP — Multiple Line Items – Multiple Payment Terms
// =============================================================================
// A completely independent third Invoice Method for calculation/save
// purposes — never shares calculation logic with Invoice Line Items (qty ×
// rate). It DOES deliberately share its milestone SOURCE with Lump Sum: both
// read the project's existing Payment Milestones (getMilestonesForProject /
// Project.paymentMilestones) — there is no separate MLMP milestone template
// to configure. Each activity's own quantity auto-generates that many SETs
// (Qty 2 SET → SET 1, SET 2 — getMlmpSetCount), each cloned from that SAME
// Payment Milestones list and tracked completely independently per SET via
// InvoiceLine.setIndex.

/** Whole-number SET count this activity's quantity generates. Permissive by design: fractional quantities are simply rounded, never blocked or warned about. */
export function getMlmpSetCount(item: InvoiceItem): number {
  return Math.max(1, Math.round(item.qty || 1));
}

/** The activity's own UOM, used as the SET/PACKAGE/MODULE/... label for its generated sub-units. */
export function getMlmpSetLabel(item: InvoiceItem): string {
  return (item.uom || "SET").trim().toUpperCase() || "SET";
}

export interface MlmpSetMilestoneRow extends LumpSumMilestoneRow {
  setIndex: number;
  setLabel: string;
  /** The invoiceNo this (SET, milestone) pair was already billed under, if any. */
  invoicedUnderInvoiceNo?: string;
  invoicedUnderCycleLabel?: string;
}

export interface MlmpSetGroup {
  setIndex: number;
  setLabel: string;
  milestones: MlmpSetMilestoneRow[];
  /** True once every milestone cloned into this SET has been billed (any non-cancelled line). */
  isSetComplete: boolean;
}

/**
 * One group per SET this activity's quantity generates, each carrying a
 * clone of the project's EXISTING Payment Milestones (getMilestonesForProject
 * — the same list Lump Sum reads; there is no separate MLMP template),
 * scaled against this SET's own share of the activity's Contract Value
 * (totalPrice ÷ SET count). A milestone row is locked once billed under a
 * non-cancelled line for its exact (setIndex, milestoneId) pair, everywhere
 * except the very cycle it was billed under — identical lock semantics to
 * getProjectLumpSumMilestoneRows, just scoped to one (activity, SET) pair
 * instead of the whole project.
 */
export function getMlmpSetRows(project: Project, item: InvoiceItem): MlmpSetGroup[] {
  const template = getMilestonesForProject(project);
  const setCount = getMlmpSetCount(item);
  const setLabel = getMlmpSetLabel(item);
  const setBaseValue = round((item.totalPrice || 0) / setCount);
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  const cycles = getInvoiceCyclesForProject(project);

  return Array.from({ length: setCount }, (_, i) => {
    const setIndex = i + 1;

    const milestones: MlmpSetMilestoneRow[] = template.map((milestone) => {
      const line = lines.find(
        (l) => l.setIndex === setIndex && l.milestoneId === milestone.id && l.status !== "Cancelled"
      );
      const invoicedCycle = line ? cycles.find((c) => c.invoiceNo === line.invoiceNo) : undefined;

      return {
        id: milestone.id,
        label: milestone.label,
        percent: milestone.percent,
        invoiceAmount: getMilestoneValue(setBaseValue, milestone.percent),
        alreadyInvoiced: !!line,
        status: line ? "Completed" : "Pending",
        setIndex,
        setLabel,
        invoicedUnderInvoiceNo: line?.invoiceNo,
        invoicedUnderCycleLabel: invoicedCycle?.label,
      };
    });

    return {
      setIndex,
      setLabel,
      milestones,
      isSetComplete: milestones.length > 0 && milestones.every((m) => m.alreadyInvoiced),
    };
  });
}

export interface GstBreakdown {
  isApplicable: boolean;
  ratePercent: number;
  gstAmount: number;
  grandTotal: number;
  /** IGST (buyer outside Tamil Nadu) vs CGST + SGST — decided by the buyer state saved for this invoice. */
  isInterState: boolean;
  /** False while no buyer state has been saved for this invoice yet (CGST + SGST is then applied, exactly as the printout does for a blank state). */
  buyerStateKnown: boolean;
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * THE place-of-supply rule — the printed invoice and every Raise Invoice
 * screen use this one check. The company is registered in Tamil Nadu: a
 * buyer state outside it is inter-state (IGST); Tamil Nadu or not yet
 * entered is intra-state (CGST + SGST). Unchanged from the printout's
 * existing behaviour.
 */
export function isInterStateSupply(buyerStateName: string | null | undefined): boolean {
  return Boolean(buyerStateName && !buyerStateName.toLowerCase().includes("tamil nadu"));
}

/** The buyer state saved with this invoice's document details (Print Invoice → Buyer Information), or "" if none yet. */
export function getSavedBuyerState(project: Project, invoiceNo: string): string {
  return project.invoiceDocumentDetailsMap?.[invoiceNo]?.buyerInformation?.stateName?.trim() ?? "";
}

/**
 * THE GST eligibility rule for an invoice — the single check every Raise
 * Invoice workspace and every printed-invoice mapper uses, so the screen and
 * the printout can never disagree. GST applies only when ALL hold:
 * - the project's own Commercial Summary GST setting is on (`gstApplicable`);
 * - the project's Quantity Details currency is INR (the Quantity module's
 *   existing rule — see utils/quantityCalculations.ts);
 * - this invoice's own currency is INR — a foreign invoice currency (USD,
 *   EUR, ...) never carries GST.
 * Nothing else (billing method, payment type) changes it; GST is a display
 * and print figure only — no invoice line ever stores a GST amount.
 */
export function isGstApplicableForInvoice(project: Project, invoiceCurrency: InvoiceCurrency): boolean {
  return Boolean(project.gstApplicable) && (project.currency || "INR") === "INR" && invoiceCurrency === "INR";
}

export interface GstTaxSplit {
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

/**
 * THE GST arithmetic — used by the printed invoice (all four layouts) and,
 * through getGstBreakdown(), by every Raise Invoice screen, so the figure on
 * screen is always the figure printed. Intra-state: CGST and SGST are each
 * half the rate, rounded separately; inter-state: one IGST at the full rate.
 */
export function computeGstTax(subtotal: number, ratePercent: number, isInterState: boolean): GstTaxSplit {
  if (isInterState) {
    const igst = round(subtotal * (ratePercent / 100));
    return { cgst: 0, sgst: 0, igst, totalTax: igst };
  }
  const cgst = round(subtotal * (ratePercent / 200));
  const sgst = round(subtotal * (ratePercent / 200));
  return { cgst, sgst, igst: 0, totalTax: round(cgst + sgst) };
}

/**
 * GST for a given base amount, read from the project's own Commercial
 * Summary settings (`gstApplicable`/`gstRate`), gated by
 * isGstApplicableForInvoice(). Recomputed on every render, so changing the
 * invoice currency never leaves a stale GST figure behind. The tax treatment
 * (IGST vs CGST + SGST) follows the buyer state saved for THIS invoice —
 * the same state, rule (isInterStateSupply) and arithmetic (computeGstTax)
 * the printout uses, so screen and print always show the same tax.
 */
export function getGstBreakdown(project: Project, baseAmount: number, invoiceCurrency: InvoiceCurrency, invoiceNo: string): GstBreakdown {
  const isApplicable = isGstApplicableForInvoice(project, invoiceCurrency);
  const ratePercent = isApplicable ? project.gstRate || 18 : 0;
  const buyerState = getSavedBuyerState(project, invoiceNo);
  const isInterState = isInterStateSupply(buyerState);
  const split = isApplicable ? computeGstTax(baseAmount, ratePercent, isInterState) : { cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
  const grandTotal = round(baseAmount + split.totalTax);
  return {
    isApplicable,
    ratePercent,
    gstAmount: split.totalTax,
    grandTotal,
    isInterState,
    buyerStateKnown: buyerState !== "",
    cgst: split.cgst,
    sgst: split.sgst,
    igst: split.igst,
  };
}

/** "IGST 18%" or "CGST 9% + SGST 9%" — the treatment actually applied. */
export function describeGstTreatment(gst: GstBreakdown): string {
  return gst.isInterState ? `IGST ${gst.ratePercent}%` : `CGST ${gst.ratePercent / 2}% + SGST ${gst.ratePercent / 2}%`;
}

export const INVOICE_LINE_STATUS_LABEL: Record<InvoiceLineStatus, string> = {
  Draft: "Draft",
  Raised: "Raised / Submitted",
  PartiallyPaid: "Partially Paid",
  Paid: "Paid",
  Cancelled: "Cancelled",
};

/** Badge color per status — the single shared mapping for every screen that displays an Invoice Status (Raise Invoice, Edit Invoice, Invoice Summary, Invoice History, Invoice Cycle selector). */
export const INVOICE_LINE_STATUS_TONE: Record<InvoiceLineStatus, Tone> = {
  Draft: "neutral",
  Raised: "info",
  PartiallyPaid: "warning",
  Paid: "success",
  Cancelled: "danger",
};

/** Raise Invoice popup — an invoice cannot be (partially) paid the moment it's created. */
export const RAISE_INVOICE_STATUS_OPTIONS: InvoiceLineStatus[] = ["Draft", "Raised", "Cancelled"];

/** Edit Invoice — the full lifecycle, settable later once payment activity actually occurs. */
export const EDIT_INVOICE_STATUS_OPTIONS: InvoiceLineStatus[] = ["Draft", "Raised", "PartiallyPaid", "Paid", "Cancelled"];

/**
 * The Invoice Cycle's own status — a single value representing every line
 * saved under one invoiceNo (Invoice Summary card, Invoice History's group
 * header, and the Invoice Cycle picker all show this same aggregate, never
 * three independently-computed answers to "what state is this cycle in?").
 * Cascades from most-to-least advanced so a cycle with mixed per-line
 * statuses (e.g. one line edited to Paid while another is still Raised)
 * still resolves to one deterministic answer:
 *   all Cancelled → Cancelled; all (non-cancelled) Paid → Paid; any
 *   Paid/PartiallyPaid → PartiallyPaid; any Raised → Raised; else Draft.
 */
export function getInvoiceCycleStatus(project: Project, invoiceNo: string): InvoiceLineStatus {
  const statuses: InvoiceLineStatus[] = [];
  (Array.isArray(project.invoiceItems) ? project.invoiceItems : []).forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
      if (line.invoiceNo === invoiceNo) statuses.push(line.status);
    });
  });

  if (statuses.length === 0) return "Draft";

  const active = statuses.filter((status) => status !== "Cancelled");
  if (active.length === 0) return "Cancelled";
  if (active.every((status) => status === "Paid")) return "Paid";
  if (active.some((status) => status === "Paid" || status === "PartiallyPaid")) return "PartiallyPaid";
  if (active.some((status) => status === "Raised")) return "Raised";
  return "Draft";
}

/**
 * Manual invoice numbering (Oct 2026) — the cycle key that stands for "a new
 * invoice whose number the user has not entered yet". Users enter their own
 * Tally invoice number in the Raise Invoice form; the portal never generates
 * one (the previous suggestNextInvoiceNumber() is gone). This value is a
 * placeholder ONLY: no invoice line can ever be saved with it — every
 * workspace writes the number typed into its Invoice No field
 * (useInvoiceNumberField.ts), and the backend rejects blank numbers.
 */
export const NEW_INVOICE_CYCLE = "__NEW_INVOICE__";

export interface InvoiceCycleOption {
  invoiceNo: string;
  /** "Invoice 1", "Invoice 2", ... — sequence position, not tied to the literal INV-### suffix (which may not always be numeric/contiguous, e.g. imported data). */
  label: string;
  /** The cycle's existing invoice date, so selecting it can pre-fill Invoice Date — undefined for the not-yet-created "next" cycle. */
  invoiceDate?: string;
  /** True for the one trailing option representing a brand-new, not-yet-saved cycle. */
  isNew: boolean;
}

/**
 * Every Invoice Cycle already used in the project (across every activity),
 * in creation order, labeled "Invoice 1"/"Invoice 2"/... — plus one trailing
 * "new cycle" option. Invoice Cycles are always PROJECT-level, never
 * activity-level: one cycle (e.g. "Invoice 1") is shared by every activity
 * billed under it — Draftsman, Lead Engineer, Project Manager, etc. all
 * participate in the same cycle rather than each having its own independent
 * "Invoice 1". This is the single source of truth for the Invoice Cycle
 * dropdown everywhere it appears — Commercial Milestone Billing's Raise
 * Invoice dialog (join an existing cycle or start a new one), Lump Sum's
 * project-level cycle selector (InvoiceSummaryPanel / InvoiceDashboard), and
 * Invoice History's grouping.
 */
export function getInvoiceCyclesForProject(project: Project): InvoiceCycleOption[] {
  const items = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];
  const firstSeenDate = new Map<string, string>();
  items.forEach((it) => {
    (Array.isArray(it.invoices) ? it.invoices : []).forEach((line) => {
      if (line.status === "Cancelled") return;
      if (!firstSeenDate.has(line.invoiceNo)) firstSeenDate.set(line.invoiceNo, line.invoiceDate);
    });
  });

  // Sort by the numeric INV-### suffix so the label sequence reflects true
  // billing order even if invoice numbers were entered out of order.
  const sorted = Array.from(firstSeenDate.entries()).sort((a, b) => {
    const numA = parseInt(/(\d+)\s*$/.exec(a[0])?.[1] ?? "0", 10);
    const numB = parseInt(/(\d+)\s*$/.exec(b[0])?.[1] ?? "0", 10);
    return numA - numB;
  });

  const options: InvoiceCycleOption[] = sorted.map(([invoiceNo, invoiceDate], index) => ({
    invoiceNo,
    label: `Invoice ${index + 1}`,
    invoiceDate,
    isNew: false,
  }));

  options.push({
    invoiceNo: NEW_INVOICE_CYCLE,
    label: `Invoice ${options.length + 1}`,
    isNew: true,
  });

  return options;
}

export interface CumulativeProgress {
  contractQty: number;
  completedQty: number;
  remainingQty: number;
  uom: string;
  progressPercent: number;
}

/**
 * Cumulative Activities Billing progress — Completed Qty is ALWAYS the sum
 * of quantityBilled across every non-cancelled invoice ever saved against
 * this activity (Invoice 1 + Invoice 2 + Invoice 3 + ...), regardless of
 * whether the project also has payment milestones configured elsewhere.
 *
 * This is deliberately different from getActivityCompletedQty/
 * calculateExecutionProgress above, which take the MAX across lines when
 * milestones exist — correct ONLY for the legacy per-milestone billing
 * ledger (still used by RaiseInvoiceDrawer's individual View/Edit-line flow,
 * where Draft/Final/Closure legitimately re-attest the SAME completed work
 * at each payment stage, so summing them would triple-count it). The
 * unified, project-wide "+ Raise Invoice" workflow (Activities Billing →
 * Invoice Cycle picker → Invoice Workspace) never references milestones per
 * line at all — every saved line there is a distinct chunk of quantity, so
 * Activities Billing must always read Completed Qty as a plain running
 * total across every cycle, exactly like an ERP roll-up (Doc: 300 + 300 +
 * 150 = 750, never overwritten by the latest invoice alone).
 */
export function calculateCumulativeProgress(item: InvoiceItem): CumulativeProgress {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  const completedQty = round(
    lines.filter((line) => line.status !== "Cancelled").reduce((sum, line) => sum + (line.quantityBilled || 0), 0)
  );
  const remainingQty = Math.max(round(item.qty - completedQty), 0);
  const progressPercent = item.qty > 0 ? Math.min(round((completedQty / item.qty) * 100), 100) : 0;
  return { contractQty: item.qty, completedQty, remainingQty, uom: item.uom, progressPercent };
}

/**
 * Sum of quantityBilled across every non-cancelled line for this activity,
 * across every OTHER invoice cycle — never the cycle currently being
 * composed. This is the "Already Raised Qty" figure for the unified,
 * project-wide Raise Invoice workspace (one common button → one Excel-style
 * table covering every activity at once). Unlike getActivityCompletedQty
 * above (which takes the MAX across milestone-billed lines, since the same
 * completed work is legitimately re-attested at each payment stage), the
 * unified workspace never references milestones at all — every line it
 * writes represents a distinct chunk of quantity, so a plain SUM is correct
 * here regardless of whether this project also has payment milestones
 * configured elsewhere.
 */
export function getActivityRaisedQtyExcludingCycle(item: InvoiceItem, invoiceNo: string): number {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  return round(
    lines
      .filter((line) => line.status !== "Cancelled" && line.invoiceNo !== invoiceNo)
      .reduce((sum, line) => sum + (line.quantityBilled || 0), 0)
  );
}

/**
 * Amount Based's equivalent of getActivityRaisedQtyExcludingCycle above —
 * sum of invoiceAmountINR across every non-cancelled line for this activity,
 * across every OTHER invoice cycle. "Previously Invoiced" in the Amount
 * Allocation table; Balance Available = Contract Value − this.
 */
export function getActivityRaisedAmountExcludingCycle(item: InvoiceItem, invoiceNo: string): number {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  return round(
    lines
      .filter((line) => line.status !== "Cancelled" && line.invoiceNo !== invoiceNo)
      .reduce((sum, line) => sum + (line.invoiceAmountINR || 0), 0)
  );
}

/**
 * The single line (if any) this activity already has under the given cycle.
 * The unified workspace keeps at most one line per (activity, cycle) pair —
 * reopening a cycle re-populates its existing Current Invoice Qty for
 * editing rather than ever creating a second, duplicate line for the same
 * activity in the same cycle.
 */
export function getActivityLineForCycle(item: InvoiceItem, invoiceNo: string): InvoiceLine | undefined {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  return lines.find((line) => line.invoiceNo === invoiceNo && line.status !== "Cancelled");
}

export interface InvoiceCycleListRow extends InvoiceCycleOption {
  totalAmount: number;
  activitiesIncluded: number;
  status: InvoiceLineStatus;
}

/**
 * Every Invoice Cycle in the project (plus the trailing "new cycle" option),
 * each carrying its total billed amount, activity count, and aggregate
 * Invoice Status (getInvoiceCycleStatus) — the data source for the common
 * "Raise Invoice" cycle-picker popup (Select Invoice Cycle → Continue →
 * Invoice Workspace).
 */
export function getInvoiceCycleListForRaise(project: Project): InvoiceCycleListRow[] {
  const cycles = getInvoiceCyclesForProject(project);
  const items = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];

  return cycles.map((cycle) => {
    const activityIds = new Set<string>();
    let totalAmount = 0;
    items.forEach((item) => {
      (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
        if (line.invoiceNo !== cycle.invoiceNo || line.status === "Cancelled") return;
        activityIds.add(item.id);
        totalAmount += line.invoiceAmountINR;
      });
    });
    return {
      ...cycle,
      totalAmount: round(totalAmount),
      activitiesIncluded: activityIds.size,
      status: getInvoiceCycleStatus(project, cycle.invoiceNo),
    };
  });
}

export interface InvoiceCycleTotals {
  systemTotal: number;
  finalInvoiceAmount: number;
}

/** This one activity's saved (non-cancelled) contribution to a given Invoice Cycle — optionally excluding one line, e.g. the line currently being edited (its live, in-progress values are folded in separately by the caller). */
export function getActivityInvoiceCycleTotals(
  item: InvoiceItem,
  invoiceNo: string,
  excludeLineId?: string
): InvoiceCycleTotals {
  const lines = (Array.isArray(item.invoices) ? item.invoices : []).filter(
    (line) => line.invoiceNo === invoiceNo && line.status !== "Cancelled" && line.id !== excludeLineId
  );
  return {
    systemTotal: round(lines.reduce((sum, line) => sum + (line.calculatedAmountINR ?? 0), 0)),
    finalInvoiceAmount: round(lines.reduce((sum, line) => sum + line.invoiceAmountINR, 0)),
  };
}

export interface OtherActivitiesInvoiceCycleTotals extends InvoiceCycleTotals {
  /** Count of distinct OTHER activities (excluding the one the drawer is currently open for) already contributing to this cycle. */
  activitiesIncluded: number;
}

/**
 * Every OTHER activity's saved (non-cancelled) contribution to a given
 * Invoice Cycle, excluding the activity the Raise Invoice drawer is
 * currently open for (the caller adds that activity's own total — draft or
 * saved — separately). This is what makes "one invoice, multiple
 * activities" possible: the drawer only ever edits one activity's lines at a
 * time, but the Invoice Summary rolls up every activity sharing the cycle.
 */
export function getOtherActivitiesInvoiceCycleTotals(
  project: Project,
  invoiceNo: string,
  excludeItemId: string
): OtherActivitiesInvoiceCycleTotals {
  const items = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];
  const activityIds = new Set<string>();
  let systemTotal = 0;
  let finalInvoiceAmount = 0;

  items.forEach((otherItem) => {
    if (otherItem.id === excludeItemId) return;
    (Array.isArray(otherItem.invoices) ? otherItem.invoices : []).forEach((line) => {
      if (line.invoiceNo !== invoiceNo || line.status === "Cancelled") return;
      activityIds.add(otherItem.id);
      systemTotal += line.calculatedAmountINR ?? 0;
      finalInvoiceAmount += line.invoiceAmountINR;
    });
  });

  return {
    activitiesIncluded: activityIds.size,
    systemTotal: round(systemTotal),
    finalInvoiceAmount: round(finalInvoiceAmount),
  };
}

export { getInvoiceRaisedAmount };

// =============================================================================
// Invoice Calculation Service — Public API
// =============================================================================
// Every screen in the Invoice module (Activities Billing, Raise Invoice,
// Invoice History, KPI Cards) must read its figures from one of the
// functions below rather than composing the primitives above itself. This
// is the single entry point the architecture is built around:
//   - Cumulative Activities Billing progress (Order/Completed/Remaining
//     Qty) → always the sum of every non-cancelled invoice ever raised for
//     an activity, never overwritten by whichever invoice was saved most
//     recently → calculateCumulativeProgress (Quantity-Based Billing only —
//     Activities Billing no longer has a milestone concept at all).
//   - The legacy per-milestone execution/ledger figures, still used only by
//     RaiseInvoiceDrawer's individual View/Edit-line flow → getActivityCompletedQty /
//     calculateExecutionProgress.
//   - Project-level KPIs (Invoice Raised, Balance, Outstanding, Payment
//     Received) → calculateProjectKPIs.
//   - Per-activity invoice status → calculateInvoiceStatus.
// No React component in this module should perform financial calculations
// directly — it should only render what these return.

export interface ExecutionProgress {
  contractQty: number;
  completedQty: number;
  remainingQty: number;
  uom: string;
  progressPercent: number;
}

/**
 * Quantity Progress — Contract/Completed/Remaining Qty and UOM, derived from
 * saved, non-cancelled invoice lines (getActivityCompletedQty — see its own
 * doc comment for why milestone-billed activities take the max qty ever
 * attested rather than a sum, while plain quantity-driven ones sum a shared
 * pool). The single Quantity Progress engine either way.
 */
export function calculateExecutionProgress(project: Project, item: InvoiceItem): ExecutionProgress {
  const milestones = getMilestonesForProject(project);
  const completedQty = getActivityCompletedQty(item, milestones);
  const remainingQty = getActivityRemainingQty(item, milestones);
  const progressPercent = item.qty > 0 ? Math.min(round((completedQty / item.qty) * 100), 100) : 0;
  return { contractQty: item.qty, completedQty, remainingQty, uom: item.uom, progressPercent };
}

/**
 * Project-level KPIs (Invoice Raised, Balance to Invoice, Outstanding,
 * Payment Received, Invoice Completion %, Invoice Status). Thin alias of
 * `getProjectCommercialSummary` — the underlying calculation is shared
 * app-wide (Dashboard, Reports, View Project), not reimplemented here.
 */
export const calculateProjectKPIs = getProjectCommercialSummary;

/** Per-activity invoice status (Pending/Partially Invoiced/Completed). Thin alias of `getInvoiceStatus` — same reasoning as calculateProjectKPIs. */
export const calculateInvoiceStatus = getInvoiceStatus;
