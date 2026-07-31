import { Landmark, Info } from "lucide-react";

import { formatBusinessINR, formatFullINR } from "../../../utils/formatCurrency";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";

interface Props {
  currency: string;
  workOrderValueINR: number;
  gstApplicable: boolean;
  gstRate: number;
  gstAmount: number;
  grandTotal: number;
  /** When true, shows the GST dropdown. When false (View Project / reference), renders a read-only badge. */
  editable: boolean;
  onGstApplicableChange?: (value: boolean) => void;
}

const CommercialSummaryCard = ({
  currency,
  workOrderValueINR,
  gstApplicable,
  gstRate,
  gstAmount,
  grandTotal,
  editable,
  onGstApplicableChange,
}: Props) => {
  const isGstEligible = currency === "INR";
  const isGstEffective = isGstEligible && gstApplicable;

  return (
    <Card padded={false} elevated>
      <CardHeader
        icon={<Landmark size={15} />}
        title="Commercial Summary"
        subtitle="Project commercial calculation overview"
        iconTint="success"
        action={
          editable ? (
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                GST
              </label>
              <select
                value={gstApplicable ? "Applicable" : "Not Applicable"}
                disabled={!isGstEligible}
                onChange={(e) =>
                  onGstApplicableChange?.(e.target.value === "Applicable")
                }
                className={`h-9 w-full rounded-[var(--nu-radius-md)] border px-2.5 text-[12.5px] font-medium outline-none transition-shadow focus:ring-2 focus:ring-[var(--nu-accent)]/25 focus:border-[var(--nu-accent)] ${
                  isGstEligible
                    ? "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text)]"
                    : "cursor-not-allowed border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)]"
                }`}
              >
                <option value="Not Applicable">Not Applicable</option>
                <option value="Applicable">Applicable</option>
              </select>
            </div>
          ) : (
            <span
              className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${
                isGstEffective
                  ? "border-[var(--nu-success)]/30 bg-[var(--nu-success-soft)] text-[var(--nu-success)]"
                  : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)]"
              }`}
            >
              GST: {isGstEffective ? "Applicable" : "Not Applicable"}
            </span>
          )
        }
      />

      <CardBody>
        {!isGstEligible && (
          <div className="mb-4 flex items-start gap-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-warning)]/30 bg-[var(--nu-warning-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--nu-warning)]">
            <Info size={14} strokeWidth={2.25} className="mt-0.5 shrink-0" />
            <p>
              <span className="font-semibold">GST Not Applicable.</span>{" "}
              GST calculations are available only for INR projects.
            </p>
          </div>
        )}

        <div className="divide-y divide-[var(--nu-border)]">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-[12.5px] font-medium text-[var(--nu-text-secondary)]">
              Total Work Order Value
            </span>
            <span className="text-[13px] font-bold text-[var(--nu-accent)] whitespace-nowrap" title={formatFullINR(workOrderValueINR)}>
              {formatBusinessINR(workOrderValueINR)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-[12.5px] font-medium text-[var(--nu-text-secondary)]">
              GST Applicability
            </span>
            <span className="text-[13px] font-semibold text-[var(--nu-text)]">
              {isGstEffective ? "Applicable" : "Not Applicable"}
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-[12.5px] font-medium text-[var(--nu-text-secondary)]">
              GST Rate
            </span>
            <span className="text-[13px] font-semibold text-[var(--nu-text)]">
              {gstRate}%
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-[12.5px] font-medium text-[var(--nu-text-secondary)]">
              GST Amount
            </span>
            <span className="text-[13px] font-bold text-[var(--nu-warning)] whitespace-nowrap" title={formatFullINR(gstAmount)}>
              {formatBusinessINR(gstAmount)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-[var(--nu-radius-md)] border border-[var(--nu-success)]/30 bg-[var(--nu-success-soft)] px-4 py-3">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--nu-success)]">
            Grand Total (Incl. GST)
          </span>
          <span className="text-[16px] font-bold text-[var(--nu-success)] whitespace-nowrap" title={formatFullINR(grandTotal)}>
            {formatBusinessINR(grandTotal)}
          </span>
        </div>
      </CardBody>
    </Card>
  );
};

export default CommercialSummaryCard;
