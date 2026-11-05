import type { InvoiceGstBreakdownDto } from "../../../../services/invoicePaymentService";
import { Notice } from "./PaymentFormParts";
import { gstTaxTypeLabel } from "./invoiceGst";

interface Props {
  gst: InvoiceGstBreakdownDto;
  /** Formats a server amount string in the invoice currency (the popup's own formatter). */
  fmt: (value: string) => string;
}

/**
 * Record Payment - the invoice's GST, READ ONLY (Nov 2026). GST is a component of the invoice, never a deduction and never something typed
 * here: the rate, tax type and amounts come from the GST snapshot saved with the invoice when it was raised, and Total (incl. GST) is the
 * amount the settlement is measured against. Three states are told apart on purpose:
 * - a snapshot at some rate (including 0%): the full breakdown;
 * - a snapshot "not applicable": the invoice carries no GST;
 * - no snapshot (an invoice raised before GST snapshots existed): "GST details not available (legacy invoice)" - it settles on its taxable value.
 */
export function InvoicePaymentGstPanel({ gst, fmt }: Props) {
  if (gst.availability === "LEGACY") {
    return (
      <section aria-label="Invoice GST" data-testid="gst-panel" data-gst-state="legacy">
        <Notice tone="info">{gst.note ?? "GST details not available (legacy invoice)"}. This invoice settles on its taxable value of {fmt(gst.taxableAmount)}.</Notice>
      </section>
    );
  }

  const applicable = gst.status === "APPLICABLE";
  return (
    <section aria-label="Invoice GST" data-testid="gst-panel" data-gst-state={applicable ? "applicable" : "not-applicable"}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-3 sm:grid-cols-3 lg:grid-cols-5">
        <PanelCell label="Taxable value" testId="gst-taxable">
          {fmt(gst.taxableAmount)}
        </PanelCell>
        <PanelCell label="GST rate" testId="gst-rate">
          {applicable ? `${gst.ratePercent}%` : "Not applicable"}
        </PanelCell>
        <PanelCell label="GST type" testId="gst-type">
          {applicable ? gstTaxTypeLabel(gst.taxType) : "-"}
        </PanelCell>
        <PanelCell label="GST amount" testId="gst-amount">
          {fmt(gst.gstAmount)}
          {applicable && gst.taxType === "CGST_SGST" && (
            <span className="block text-[10.5px] font-medium text-[var(--nu-text-muted)]">
              CGST {fmt(gst.cgstAmount)} + SGST {fmt(gst.sgstAmount)}
            </span>
          )}
        </PanelCell>
        <PanelCell label="Total incl. GST" testId="gst-total">
          <strong>{fmt(gst.totalAmount)}</strong>
        </PanelCell>
      </dl>
      <p className="mt-1.5 text-[11.5px] text-[var(--nu-text-muted)]">
        GST is part of the invoice amount, not a deduction. The payment is settled against the total including GST.
      </p>
    </section>
  );
}

function PanelCell({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-[12.5px] font-semibold text-[var(--nu-text)] tabular-nums" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}
