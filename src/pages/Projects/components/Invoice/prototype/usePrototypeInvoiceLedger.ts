import { useMemo, useState } from "react";
import type { PrototypeActivityLedger, PrototypeInvoiceEntry, PrototypeInvoiceStatus } from "./prototypeTypes";
import { calculateMilestoneAmount } from "./prototypeCalculations";

/**
 * PROTOTYPE ONLY. Simulates a quantity-wise invoice ledger entirely in React
 * state — nothing here ever reads from or writes to `project` / `setProject`,
 * localStorage, or any existing service. Reloading the page resets everything
 * back to zero. Deleting this file (and the rest of `prototype/`) removes the
 * simulated ledger with no trace elsewhere.
 *
 * This hook is entirely milestone-structure-agnostic — it only ever tracks
 * completed quantity keyed by whatever `milestoneId` it's given, and never
 * looks up milestone names/percentages itself (that always comes from
 * getProjectMilestones() in prototypeCalculations.ts, reading the Payments
 * tab live). That's what lets it support 1, 2, 4, or 10 milestones with zero
 * changes here.
 *
 * Completed quantity is ALWAYS derived fresh from `history` (never a
 * separately-maintained counter) — excluding Cancelled entries — so Add /
 * Edit / Delete can never drift out of sync with what Billing History
 * actually shows. This is also why Edit and Delete "automatically recalculate
 * everything": every consumer (Milestone Cards, Commercial Summary, Billing
 * History) reads from this same derivation on every render.
 */

const round = (value: number): number => Math.round(value * 100) / 100;

export interface RaiseInvoiceInput {
  activityId: string;
  invoiceNo: string;
  invoiceDate: string;
  milestoneId: string;
  /** The milestone's CURRENT percentage, looked up by the caller from getProjectMilestones() — never stored/assumed here. */
  percent: number;
  quantity: number;
  remarks: string;
  fileName?: string;
  unitPrice: number;
}

export interface UpdateInvoiceInput {
  id: string;
  quantity: number;
  invoiceDate: string;
  remarks: string;
  status: PrototypeInvoiceStatus;
  unitPrice: number;
  /** The milestone's CURRENT percentage — same reasoning as RaiseInvoiceInput. */
  percent: number;
}

export function usePrototypeInvoiceLedger() {
  const [history, setHistory] = useState<PrototypeInvoiceEntry[]>([]);
  const [nextSeq, setNextSeq] = useState(1);

  const getLedger = (activityId: string): PrototypeActivityLedger => {
    const ledger: PrototypeActivityLedger = {};

    history.forEach((entry) => {
      if (entry.activityId !== activityId || entry.status === "cancelled") return;
      ledger[entry.milestoneId] = round((ledger[entry.milestoneId] ?? 0) + entry.quantity);
    });

    return ledger;
  };

  const getPendingQty = (activityId: string, milestoneId: string, totalQty: number): number => {
    const ledger = getLedger(activityId);
    const completed = ledger[milestoneId] ?? 0;
    return Math.max(round(totalQty - completed), 0);
  };

  /**
   * Max quantity a SPECIFIC existing invoice can be edited to — i.e. total
   * quantity minus whatever every *other* non-cancelled entry for the same
   * activity + milestone already accounts for. Using getPendingQty directly
   * for an edit would incorrectly treat the entry's own current quantity as
   * "already used up", blocking it from being saved unchanged.
   */
  const getEditableMaxQuantity = (invoiceId: string, totalQty: number): number => {
    const target = history.find((entry) => entry.id === invoiceId);
    if (!target) return totalQty;

    let othersCompleted = 0;
    history.forEach((entry) => {
      if (entry.id === invoiceId) return;
      if (entry.activityId !== target.activityId || entry.milestoneId !== target.milestoneId) return;
      if (entry.status === "cancelled") return;
      othersCompleted += entry.quantity;
    });

    return Math.max(round(totalQty - othersCompleted), 0);
  };

  const sortMostRecentFirst = (a: PrototypeInvoiceEntry, b: PrototypeInvoiceEntry): number =>
    b.invoiceDate.localeCompare(a.invoiceDate) || b.invoiceNo.localeCompare(a.invoiceNo);

  const getHistoryForActivity = (activityId: string, limit = 5): PrototypeInvoiceEntry[] =>
    history.filter((entry) => entry.activityId === activityId).sort(sortMostRecentFirst).slice(0, limit);

  /** Full, unfiltered invoice history across every activity — feeds the Billing History screen. */
  const getAllHistory = (): PrototypeInvoiceEntry[] => [...history].sort(sortMostRecentFirst);

  const suggestNextInvoiceNo = useMemo(() => `INV${String(nextSeq).padStart(3, "0")}`, [nextSeq]);

  const raiseInvoice = (input: RaiseInvoiceInput): void => {
    // The single shared calculation — never recomputed independently here.
    const amount = calculateMilestoneAmount(input.quantity, input.unitPrice, input.percent);

    setHistory((prev) => [
      {
        id: crypto.randomUUID(),
        activityId: input.activityId,
        invoiceNo: input.invoiceNo,
        invoiceDate: input.invoiceDate,
        milestoneId: input.milestoneId,
        quantity: input.quantity,
        amount,
        remarks: input.remarks,
        fileName: input.fileName,
        status: "pending",
      },
      ...prev,
    ]);

    setNextSeq((seq) => seq + 1);
  };

  const updateInvoice = (input: UpdateInvoiceInput): void => {
    setHistory((prev) =>
      prev.map((entry) => {
        if (entry.id !== input.id) return entry;
        return {
          ...entry,
          quantity: input.quantity,
          invoiceDate: input.invoiceDate,
          remarks: input.remarks,
          status: input.status,
          amount: calculateMilestoneAmount(input.quantity, input.unitPrice, input.percent),
        };
      })
    );
  };

  const deleteInvoice = (invoiceId: string): void => {
    setHistory((prev) => prev.filter((entry) => entry.id !== invoiceId));
  };

  return {
    getLedger,
    getPendingQty,
    getEditableMaxQuantity,
    getHistoryForActivity,
    getAllHistory,
    raiseInvoice,
    updateInvoice,
    deleteInvoice,
    suggestNextInvoiceNo,
  };
}
