import type { InvoiceCurrency } from "../../../../types/InvoiceItem";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";
import { describeGstTreatment, type GstBreakdown } from "./InvoiceCalculations";
import { formatInvoiceMoney, isForeignCurrency } from "./invoiceCurrency";

const boxClass = "bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800";
const labelClass = "text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const noteClass = "text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums";

/** The explicit reference-only INR line shown under any foreign-currency amount. */
export function InrReferenceNote({ inr }: { inr: number }) {
  return <p className={noteClass}>INR equivalent — for reference only: {formatIndianCurrency(inr)}</p>;
}

interface Props {
  gst: GstBreakdown;
  currency: InvoiceCurrency;
  /** Invoice-currency total (foreign invoices only; ignored for INR). */
  originalTotal: number | null;
  /** The INR equivalent that will be saved (for a foreign invoice shown only as a reference). */
  inrTotal: number;
  grandTotalLabel?: string;
  grandTotalClassName?: string;
}

/**
 * GST + Grand Total summary boxes shared by the Amount Based, Lump Sum and
 * MLMP Raise Invoice workspaces.
 * - INR: GST box (when applicable, with the treatment actually applied —
 *   IGST or CGST + SGST, from the buyer state saved for this invoice) and an
 *   INR Grand Total — the same figures the printed invoice shows.
 * - Foreign currency: no GST; the Grand Total is in the invoice currency,
 *   with the INR equivalent underneath, labelled reference only.
 */
export function InvoiceTotalBoxes({ gst, currency, originalTotal, inrTotal, grandTotalLabel = "Grand Total", grandTotalClassName = "" }: Props) {
  const isForeign = isForeignCurrency(currency) && originalTotal !== null;
  return (
    <>
      {gst.isApplicable && (
        <div className={boxClass}>
          <p className={labelClass}>GST — {describeGstTreatment(gst)}</p>
          <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{formatIndianCurrency(gst.gstAmount)}</p>
          {!gst.buyerStateKnown && (
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
              Buyer state not entered yet — becomes IGST if the buyer is outside Tamil Nadu.
            </p>
          )}
        </div>
      )}
      <div className={`bg-white/90 dark:bg-slate-900/90 p-3 rounded-xl border border-blue-300 dark:border-cyan-800 ${grandTotalClassName}`}>
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-cyan-400">{grandTotalLabel}</p>
        <p className="text-lg font-black text-blue-700 dark:text-cyan-300 mt-0.5 tabular-nums">
          {isForeign ? formatInvoiceMoney(originalTotal, currency) : formatIndianCurrency(gst.grandTotal)}
        </p>
        {isForeign && <InrReferenceNote inr={inrTotal} />}
      </div>
    </>
  );
}
