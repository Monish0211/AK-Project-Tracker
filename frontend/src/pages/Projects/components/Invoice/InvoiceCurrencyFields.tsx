import { useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { CURRENCY_NAMES } from "../../../../constants/currencies";
import { INVOICE_CURRENCY_OPTIONS, isForeignCurrency, normalizeInvoiceCurrency } from "./invoiceCurrency";
import type { InvoiceCurrencyState } from "./useInvoiceCurrencyState";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "bg-slate-100/70 dark:bg-slate-800/50 text-[var(--nu-text-secondary)] cursor-not-allowed";

/** Two header cells: Invoice Currency + Exchange Rate (any non-INR currency). Drop into an existing header grid. */
export function InvoiceCurrencyFields({ state }: { state: InvoiceCurrencyState }) {
  const [rateTouched, setRateTouched] = useState(false);
  const { currency, rateInput, setCurrency, setRateInput, rateError, isCurrencyFixed, isRateFixed, fixedReason } = state;

  return (
    <>
      <div>
        <label className={labelClass}>Invoice Currency *</label>
        <Select
          value={currency}
          disabled={isCurrencyFixed}
          className={isCurrencyFixed ? disabledFieldClass : undefined}
          onChange={(e) => setCurrency(normalizeInvoiceCurrency(e.target.value))}
        >
          {INVOICE_CURRENCY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} — {CURRENCY_NAMES[option]}
            </option>
          ))}
        </Select>
        {fixedReason && (
          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[var(--nu-text-muted)]">
            <Lock size={10} className="shrink-0" />
            {fixedReason}
          </p>
        )}
      </div>
      {isForeignCurrency(currency) && (
        <div>
          <label className={labelClass}>Exchange Rate (1 {currency} = ₹) *</label>
          <Input
            type="text"
            inputMode="decimal"
            value={rateInput}
            disabled={isRateFixed}
            placeholder="INR per 1 unit"
            invalid={rateTouched && !!rateError}
            className={isRateFixed ? disabledFieldClass : undefined}
            onBlur={() => setRateTouched(true)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
              setRateInput(raw);
            }}
          />
          {rateError && (
            <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[var(--nu-danger)]">
              <AlertTriangle size={10} className="shrink-0" />
              {rateError}
            </p>
          )}
        </div>
      )}
    </>
  );
}
