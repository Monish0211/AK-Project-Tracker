import { useState } from "react";
import { Landmark } from "lucide-react";

import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { formatMoney } from "../../../utils/currencyDisplay";
import { TAX_RATE_PRESETS, computeProjectTax, parseTaxRateInput } from "../../../utils/projectTax";

/**
 * The Commercial Summary of a project outside India (Nov 2026): Tax Applicability, Tax Rate, Tax Amount and Grand Total on the project's regional
 * Work Order Value. India keeps CommercialSummaryCard (GST). The amounts are derived on every render - see utils/projectTax.ts.
 */
interface Props {
  /** The project's regional currency: every figure on this card is in it. */
  currency: string;
  workOrderValue: number;
  applicable: boolean | null | undefined;
  ratePercent: number | null | undefined;
  /** false = View Project: read only. */
  editable: boolean;
  /** Set by the form's validation when Tax is Applicable and no rate was chosen. */
  rateError?: string | undefined;
  onApplicableChange?: (value: boolean) => void;
  onRateChange?: (value: number | null) => void;
}

const CUSTOM = "custom";
const selectClass =
  "h-9 w-full rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2.5 text-[12.5px] font-medium text-[var(--nu-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--nu-accent)]/25 focus:border-[var(--nu-accent)]";
const labelClass = "text-[12.5px] font-medium text-[var(--nu-text-secondary)]";
const valueClass = "text-[13px] font-semibold text-[var(--nu-text)]";

const ProjectTaxCard = ({ currency, workOrderValue, applicable, ratePercent, editable, rateError, onApplicableChange, onRateChange }: Props) => {
  const figures = computeProjectTax({ workOrderValue, currency, applicable, ratePercent });
  const hasRate = typeof ratePercent === "number";
  // "Custom" is either chosen here, or simply what a saved rate outside the presets is. The typed text is kept while it is being typed ("7.", "").
  const [customChosen, setCustomChosen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const isCustom = customChosen || (hasRate && !TAX_RATE_PRESETS.includes(ratePercent));
  // the typed text counts only while it still says what the project holds (a reload or another change replaces it)
  const typedIsCurrent = typed !== null && parseTaxRateInput(typed).rate === (ratePercent ?? null);
  const customText = typedIsCurrent ? typed : hasRate ? String(ratePercent) : "";
  const customError = isCustom && typedIsCurrent && typed !== "" ? parseTaxRateInput(typed).error : null;
  const shownError = customError ?? rateError;

  const choose = (value: string) => {
    if (value === CUSTOM) {
      setCustomChosen(true);
      setTyped(hasRate ? String(ratePercent) : "");
      return;
    }
    setCustomChosen(false);
    setTyped(null);
    onRateChange?.(value === "" ? null : Number(value));
  };

  const applicabilityText = applicable === true ? "Applicable" : applicable === false ? "Not Applicable" : "Not Set";
  const money = (value: number) => formatMoney(value, currency);

  return (
    <Card padded={false} elevated>
      <div data-testid="project-tax-card">
        <CardHeader
          icon={<Landmark size={15} />}
          title="Commercial Summary"
          subtitle="Project commercial calculation overview"
          iconTint="success"
          action={
            editable ? (
              <div className="w-full sm:w-44">
                <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Tax Applicability</label>
                <select
                  aria-label="Tax Applicability"
                  data-testid="tax-applicability"
                  value={applicable === true ? "Applicable" : applicable === false ? "Not Applicable" : ""}
                  onChange={(e) => onApplicableChange?.(e.target.value === "Applicable")}
                  className={selectClass}
                >
                  {applicable !== true && applicable !== false && (
                    <option value="" disabled>
                      Not Set
                    </option>
                  )}
                  <option value="Not Applicable">Not Applicable</option>
                  <option value="Applicable">Applicable</option>
                </select>
              </div>
            ) : (
              <span
                className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  applicable === true
                    ? "border-[var(--nu-success)]/30 bg-[var(--nu-success-soft)] text-[var(--nu-success)]"
                    : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)]"
                }`}
              >
                Tax: {applicabilityText}
              </span>
            )
          }
        />

        <CardBody>
          <div className="divide-y divide-[var(--nu-border)]">
            <div className="flex items-center justify-between py-2.5">
              <span className={labelClass}>Total Work Order Value</span>
              <span className="text-[13px] font-bold text-[var(--nu-accent)] whitespace-nowrap" data-testid="tax-work-order-value">
                {money(figures.workOrderValue)}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className={labelClass}>Tax Applicability</span>
              <span className={valueClass} data-testid="tax-applicability-value">
                {applicabilityText}
              </span>
            </div>

            <div className="flex items-start justify-between gap-3 py-2.5">
              <span className={`${labelClass} ${editable && applicable === true ? "pt-2" : ""}`}>Tax Rate</span>
              {editable && applicable === true ? (
                <div className="flex flex-col items-end gap-1" data-field="taxRatePercent">
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Tax Rate"
                      data-testid="tax-rate"
                      value={isCustom ? CUSTOM : hasRate ? String(ratePercent) : ""}
                      onChange={(e) => choose(e.target.value)}
                      className={`${selectClass} !w-32`}
                    >
                      {!hasRate && !isCustom && (
                        <option value="" disabled>
                          Select rate
                        </option>
                      )}
                      {TAX_RATE_PRESETS.map((preset) => (
                        <option key={preset} value={String(preset)}>
                          {preset}%
                        </option>
                      ))}
                      <option value={CUSTOM}>Custom</option>
                    </select>
                    {isCustom && (
                      <div className="relative w-28">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="Custom Tax Rate (%)"
                          aria-invalid={Boolean(shownError)}
                          data-testid="tax-rate-custom"
                          placeholder="e.g. 7.5"
                          value={customText}
                          onChange={(e) => {
                            const text = e.target.value;
                            if (!/^\d*\.?\d{0,4}$/.test(text)) return;
                            setCustomChosen(true);
                            setTyped(text);
                            // an empty or out-of-range entry holds NO rate, so no amount is ever shown for something not on screen
                            onRateChange?.(parseTaxRateInput(text).rate);
                          }}
                          className={`${selectClass} pr-6 text-right ${shownError ? "!border-[var(--nu-danger)]" : ""}`}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[12px] text-[var(--nu-text-muted)]">%</span>
                      </div>
                    )}
                  </div>
                  {shownError && (
                    <p className="text-[11px] font-medium text-[var(--nu-danger)]" role="alert">
                      {shownError}
                    </p>
                  )}
                </div>
              ) : (
                <span className={valueClass} data-testid="tax-rate-value">
                  {applicable === true ? (hasRate ? `${ratePercent}%` : "Not Set") : applicable === false ? "—" : "Not Set"}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className={labelClass}>Tax Amount</span>
              <span className="text-[13px] font-bold text-[var(--nu-warning)] whitespace-nowrap" data-testid="tax-amount">
                {figures.taxAmount === null ? "—" : money(figures.taxAmount)}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-[var(--nu-radius-md)] border border-[var(--nu-success)]/30 bg-[var(--nu-success-soft)] px-4 py-3">
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--nu-success)]">Grand Total (Incl. Tax)</span>
            <span className="text-[16px] font-bold text-[var(--nu-success)] whitespace-nowrap" data-testid="tax-grand-total">
              {money(figures.grandTotal)}
            </span>
          </div>
          {figures.taxAmount === null && (
            <p className="mt-2 text-[11.5px] text-[var(--nu-text-muted)]" data-testid="tax-not-set-note">
              {figures.status === "NOT_SET" ? "Tax is not set for this project, so the total does not include tax." : "No tax rate selected yet, so the total does not include tax."}
            </p>
          )}
        </CardBody>
      </div>
    </Card>
  );
};

export default ProjectTaxCard;
