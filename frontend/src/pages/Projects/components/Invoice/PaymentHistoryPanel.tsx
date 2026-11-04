import { useState } from "react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Textarea } from "../../../../components/ui/Textarea";
import type { InvoicePaymentDto } from "../../../../services/invoicePaymentService";
import { formatMoneyString, formatReviewDate, getDeductionCategory, inrEquivalent } from "./invoicePaymentDetails";

/**
 * The ACTIVE payments of an invoice: the bank amount, the deductions (with the Security Deposit / ISD release and reminder
 * dates), who recorded it and when. Reversed payments are not part of the active entry workflow and never appear here (they stay
 * in the database with their reversal details for audit). A user with the right may reverse an active payment (reason required);
 * the server then recalculates the invoice status.
 */
export function PaymentHistoryPanel({
  payments,
  currency,
  canReverse,
  busyId,
  onReverse,
  referenceRate = null,
}: {
  payments: InvoicePaymentDto[];
  currency: string;
  canReverse: boolean;
  busyId: string | null;
  onReverse: (paymentId: string, reason: string) => void;
  /** INR per unit of the invoice currency, for the reference figures of a foreign invoice. Null for INR. Display only. */
  referenceRate?: string | null;
}) {
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const withInr = (amount: string) => {
    const inr = currency === "INR" || referenceRate === null ? null : inrEquivalent(amount, currency, referenceRate);
    return (
      <>
        {formatMoneyString(amount, currency)}
        {inr && <span className="ml-1.5 text-[11px] font-medium text-[var(--nu-text-muted)]">(INR equivalent {formatMoneyString(inr, "INR")})</span>}
      </>
    );
  };

  if (payments.length === 0) {
    return <p className="text-[12px] text-[var(--nu-text-muted)]">No active payment is recorded for this invoice.</p>;
  }

  return (
    <ul className="space-y-2.5" aria-label="Recorded payments">
      {payments.map((payment) => {
        const isReversing = reversingId === payment.id;
        return (
          <li key={payment.id} className="space-y-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11.5px] font-bold text-[var(--nu-text)]">
                Recorded {new Date(payment.recordedAt).toLocaleString()} by {payment.recordedByName}
              </p>
              {payment.movedInvoiceTo && (
                <Badge tone={payment.movedInvoiceTo === "Paid" ? "success" : "warning"} className="text-[10px]">
                  Moved the invoice to {payment.movedInvoiceTo === "PartiallyPaid" ? "Partially Paid" : payment.movedInvoiceTo}
                </Badge>
              )}
            </div>

            {payment.receipts.map((receipt) => (
              <p key={receipt.id} className="text-[12px] text-[var(--nu-text)]">
                <span className="font-semibold">Bank amount received:</span> {withInr(receipt.amountReceived)}
                <span className="text-[var(--nu-text-muted)]">
                  {" "}
                  · {receipt.paymentDate ? formatReviewDate(receipt.paymentDate) : "date not entered"} · {receipt.reference || "reference not entered"}
                  {receipt.notes ? ` · ${receipt.notes}` : ""}
                </span>
              </p>
            ))}

            {payment.adjustments.length > 0 && (
              <ul className="space-y-1">
                {payment.adjustments.map((entry) => (
                  <li key={entry.id} className="text-[12px] text-[var(--nu-text)]">
                    <span className="font-semibold">{getDeductionCategory(entry.category).label}:</span> {withInr(entry.amount)}
                    {(entry.expectedReleaseDate || entry.reminderDate) && (
                      <span className="text-[var(--nu-text-muted)]">
                        {entry.expectedReleaseDate ? ` · expected release ${formatReviewDate(entry.expectedReleaseDate)}` : ""}
                        {entry.reminderDate ? ` · reminder ${formatReviewDate(entry.reminderDate)}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canReverse && (
              <div>
                {!isReversing ? (
                  <Button type="button" variant="secondary" size="sm" disabled={busyId !== null} onClick={() => { setReversingId(payment.id); setReason(""); }}>
                    Reverse this payment
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor={`reverse-reason-${payment.id}`} className="block text-[11.5px] font-semibold text-[var(--nu-text)]">
                      Reason for reversing (required)
                    </label>
                    <Textarea id={`reverse-reason-${payment.id}`} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <div className="flex gap-2">
                      <Button type="button" variant="danger" size="sm" disabled={busyId !== null || reason.trim().length < 3} onClick={() => onReverse(payment.id, reason.trim())}>
                        {busyId === payment.id ? "Reversing..." : "Confirm reversal"}
                      </Button>
                      <Button type="button" variant="secondary" size="sm" disabled={busyId !== null} onClick={() => setReversingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
