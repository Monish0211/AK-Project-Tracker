import { useMemo, useState } from "react";
import type { Project } from "../../../../types/Project";
import type { InvoiceCurrency, InvoiceGstSelection, InvoiceGstSnapshot, InvoiceGstTaxType, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { findInvoiceGstSnapshot, getSavedBuyerState, invoiceHasRaisedLine } from "./InvoiceCalculations";
import {
  buildGstSelection,
  CUSTOM_RATE_CHOICE,
  GST_RATE_PRESETS,
  gstChoiceBlocker,
  isGstChoiceEditable,
  isLegacyGstInvoice,
  NO_GST_CHOICE,
  suggestedGstTaxType,
} from "./invoiceGst";

/** The dropdown state that reproduces a saved choice (empty when there is none). */
function initialChoiceFrom(snapshot: InvoiceGstSnapshot | undefined): { rateChoice: string; customRate: string; taxType: InvoiceGstTaxType | "" } {
  if (!snapshot) return { rateChoice: "", customRate: "", taxType: "" };
  if (snapshot.gstStatus !== "APPLICABLE") return { rateChoice: NO_GST_CHOICE, customRate: "", taxType: "" };
  const rate = String(snapshot.ratePercent ?? "");
  const isPreset = (GST_RATE_PRESETS as readonly number[]).includes(Number(rate));
  return { rateChoice: isPreset ? rate : CUSTOM_RATE_CHOICE, customRate: isPreset ? "" : rate, taxType: snapshot.taxType ?? "" };
}

export interface InvoiceGstChoice {
  /** The invoice's saved snapshot (a Draft's saved choice, or a raised invoice's frozen GST). */
  snapshot: InvoiceGstSnapshot | undefined;
  /** The invoice has been raised: its snapshot is frozen and only displayed. */
  frozen: boolean;
  /** The GST can still be chosen or changed here (an INR invoice not yet raised), whether or not a choice was already saved on its Draft. */
  needed: boolean;
  /** Raised before snapshots existed: no GST details are recorded and none will be created. */
  legacy: boolean;
  /** "" (nothing chosen), NO_GST_CHOICE, a preset rate as text ("18"), or CUSTOM_RATE_CHOICE. */
  rateChoice: string;
  setRateChoice: (choice: string) => void;
  customRate: string;
  setCustomRate: (text: string) => void;
  taxType: InvoiceGstTaxType | "";
  setTaxType: (taxType: InvoiceGstTaxType | "") => void;
  /** The complete choice, or null while it is incomplete (also null whenever no choice is needed). */
  selection: InvoiceGstSelection | null;
  buyerStateKnown: boolean;
  /** Why the invoice cannot be saved in `status` yet, or null. */
  blockerFor: (status: InvoiceLineStatus | "") => string | null;
  /** The project fields to merge into onSave()'s project so the save carries the choice to the server (empty when nothing was chosen). */
  toProjectPatch: (savedInvoiceNo: string) => Pick<Project, "invoiceGstSelections">;
}

/**
 * Invoice-level GST snapshot (Nov 2026) — the GST choice state shared by the four Raise Invoice workspaces and the Edit Invoice drawer.
 * An invoice with a saved snapshot shows it frozen. A new one starts EMPTY: no rate is taken from the project's Quantity-section GST
 * setting, and the tax type starts blank unless a buyer state is already saved for the invoice (then it is suggested from it).
 */
export function useInvoiceGstChoice(project: Project, invoiceNo: string, invoiceCurrency: InvoiceCurrency): InvoiceGstChoice {
  const snapshot = useMemo(() => findInvoiceGstSnapshot(project, invoiceNo), [project, invoiceNo]);
  const needed = isGstChoiceEditable(project, invoiceNo, invoiceCurrency);
  const frozen = Boolean(snapshot) && invoiceHasRaisedLine(project, invoiceNo);
  const legacy = isLegacyGstInvoice(project, invoiceNo, invoiceCurrency);

  // A Draft that already carries its GST choice starts from it (so it is never asked for twice); otherwise the choice starts EMPTY - nothing
  // is taken from the project's Quantity-section GST setting, and the tax type is only suggested from a buyer state that is already saved.
  const [initial] = useState(() => initialChoiceFrom(snapshot));
  const [rateChoice, setRateChoice] = useState<string>(initial.rateChoice);
  const [customRate, setCustomRate] = useState<string>(initial.customRate);
  const [taxType, setTaxType] = useState<InvoiceGstTaxType | "">(() => initial.taxType || (suggestedGstTaxType(project, invoiceNo) ?? ""));

  const buyerStateKnown = getSavedBuyerState(project, invoiceNo) !== "";
  const noGst = rateChoice === NO_GST_CHOICE;
  const rateText = rateChoice === CUSTOM_RATE_CHOICE ? customRate : noGst ? "" : rateChoice;
  const selection = needed && rateChoice !== "" ? buildGstSelection(rateText, taxType, buyerStateKnown, noGst) : null;

  return {
    snapshot,
    frozen,
    needed,
    legacy,
    rateChoice,
    setRateChoice,
    customRate,
    setCustomRate,
    taxType,
    setTaxType,
    selection,
    buyerStateKnown,
    blockerFor: (status) => gstChoiceBlocker({ needed, status, selection }),
    toProjectPatch: (savedInvoiceNo) => (selection ? { invoiceGstSelections: { [savedInvoiceNo.trim().toUpperCase()]: selection } } : {}),
  };
}
