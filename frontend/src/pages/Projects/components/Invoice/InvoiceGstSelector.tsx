import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import type { InvoiceGstTaxType, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { InvoiceGstChoice } from "./useInvoiceGstChoice";
import { CUSTOM_RATE_CHOICE, GST_RATE_PRESETS, GST_TAX_TYPE_LABEL, NO_GST_CHOICE } from "./invoiceGst";

const cardClass = "bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800";
const labelClass = "text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const noteClass = "text-[10.5px] font-medium text-slate-500 dark:text-slate-400";

interface Props {
  choice: InvoiceGstChoice;
  /** The status the invoice is about to be saved in: the "required" message only shows once it is a raised one. */
  status: InvoiceLineStatus | "";
}

/**
 * Invoice-level GST snapshot (Nov 2026) — the GST of one invoice, in the Raise / Edit Invoice screens. It is entered here, on the invoice,
 * and has nothing to do with the project's Quantity-section GST switch or rate:
 * - already raised: shown FROZEN (read-only) — what was chosen when it was raised;
 * - not raised yet (INR): "No GST", or a rate and a tax type, chosen here once and fixed on raise. A Draft that already carries its choice
 *   shows it here (still changeable until the invoice is raised), so it is never asked for a second time;
 * - raised before snapshots existed: a plain note — no GST details are recorded for it;
 * - a foreign-currency invoice: nothing is shown (it never carries GST).
 */
export function InvoiceGstSelector({ choice, status }: Props) {
  if (choice.snapshot && choice.frozen) {
    const snapshot = choice.snapshot;
    return (
      <div className={cardClass} data-testid="gst-frozen">
        <p className={labelClass}>GST (fixed when raised)</p>
        <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
          {snapshot.gstStatus === "APPLICABLE"
            ? `${snapshot.ratePercent}% · ${snapshot.taxType ? GST_TAX_TYPE_LABEL[snapshot.taxType] : ""}`
            : "No GST on this invoice"}
        </p>
        <p className={noteClass}>It does not change with the project&apos;s Quantity-section GST setting.</p>
      </div>
    );
  }

  if (choice.legacy) {
    return (
      <div className={cardClass} data-testid="gst-legacy">
        <p className={labelClass}>GST</p>
        <p className={noteClass}>GST details not available (legacy invoice). Payments for it settle on the taxable value.</p>
      </div>
    );
  }

  if (!choice.needed) return null;

  const blocker = choice.blockerFor(status);
  const isRate = choice.rateChoice !== "" && choice.rateChoice !== NO_GST_CHOICE;
  return (
    <div className={cardClass} data-testid="gst-selector">
      <p className={labelClass}>GST for this invoice — fixed once it is raised</p>
      <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5" htmlFor="gst-rate-choice">
            GST
          </label>
          <Select id="gst-rate-choice" value={choice.rateChoice} onChange={(event) => choice.setRateChoice(event.target.value)} invalid={Boolean(blocker) && choice.rateChoice === ""}>
            <option value="">Select GST…</option>
            <option value={NO_GST_CHOICE}>No GST</option>
            {GST_RATE_PRESETS.map((rate) => (
              <option key={rate} value={String(rate)}>
                {rate}%
              </option>
            ))}
            <option value={CUSTOM_RATE_CHOICE}>Custom rate…</option>
          </Select>
          {choice.rateChoice === CUSTOM_RATE_CHOICE && (
            <Input
              aria-label="Custom GST rate (%)"
              className="mt-1.5"
              inputMode="decimal"
              placeholder="e.g. 12.5"
              value={choice.customRate}
              onChange={(event) => choice.setCustomRate(event.target.value)}
              invalid={choice.customRate.trim() !== "" && choice.selection === null && Boolean(blocker)}
            />
          )}
        </div>
        {isRate && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5" htmlFor="gst-tax-type">
              Tax type
            </label>
            <Select id="gst-tax-type" value={choice.taxType} onChange={(event) => choice.setTaxType(event.target.value as InvoiceGstTaxType | "")} invalid={Boolean(blocker) && choice.taxType === ""}>
              <option value="">Select tax type…</option>
              <option value="IGST">{GST_TAX_TYPE_LABEL.IGST}</option>
              <option value="CGST_SGST">{GST_TAX_TYPE_LABEL.CGST_SGST}</option>
            </Select>
          </div>
        )}
      </div>
      <p className={`${noteClass} mt-1.5`}>
        {!isRate
          ? "Entered here for this invoice only; the project's Quantity-section GST setting is not used."
          : choice.buyerStateKnown
            ? "Tax type is suggested from the buyer state saved for this invoice — change it if it is wrong."
            : "No buyer state is saved for this invoice yet, so the tax type is not assumed — choose it."}
      </p>
      {blocker && <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mt-1">{blocker}</p>}
    </div>
  );
}
