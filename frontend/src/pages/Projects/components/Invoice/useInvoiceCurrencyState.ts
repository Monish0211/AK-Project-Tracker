import { useMemo, useState } from "react";
import type { Project } from "../../../../types/Project";
import type { InvoiceCurrency } from "../../../../types/InvoiceItem";
import {
  getDefaultRateFor,
  getInitialCurrencySelection,
  getInvoiceCycleCurrency,
  getProjectInvoiceCurrencyLock,
  isForeignCurrency,
  isInvoiceCurrencySupported,
  validateExchangeRate,
  type InvoiceCurrencySelection,
} from "./invoiceCurrency";

export interface InvoiceCurrencyState {
  currency: InvoiceCurrency;
  rateInput: string;
  setCurrency: (currency: InvoiceCurrency) => void;
  setRateInput: (value: string) => void;
  /** Validated selection, or null while a foreign currency's rate is missing/invalid. */
  selection: InvoiceCurrencySelection | null;
  rateError: string | null;
  /** Currency can't be changed: the invoice already has saved lines, the project is locked, or the backend doesn't support invoice currency. */
  isCurrencyFixed: boolean;
  /** Rate can't be changed: the invoice already has saved lines. */
  isRateFixed: boolean;
  /** Why the currency is fixed — shown under the field. */
  fixedReason: string | null;
}

/**
 * Invoice Currency feature (Oct 2026) — the per-invoice currency/rate state
 * shared by all four Raise Invoice workspaces. An invoice that already has
 * saved lines keeps the currency/rate those lines were raised in (both
 * frozen — the backend rejects any change). A new invoice defaults to the
 * project's locked currency (fixed if locked), else INR. A foreign rate is
 * prefilled ONLY from the project's own current exchange rate when the
 * project's Quantity Details currency is that same currency (see
 * getDefaultRateFor()) — otherwise blank — and always stays editable so
 * Accounts can confirm or override it. Switching currency re-applies that
 * prefill, so a rate meant for one currency never carries over to another.
 */
export function useInvoiceCurrencyState(project: Project, invoiceNo: string): InvoiceCurrencyState {
  const existing = useMemo(() => getInvoiceCycleCurrency(project, invoiceNo), [project, invoiceNo]);
  const lock = useMemo(() => getProjectInvoiceCurrencyLock(project), [project]);
  const supported = isInvoiceCurrencySupported(project);

  const [initial] = useState(() => getInitialCurrencySelection(project, invoiceNo));
  const [currency, setCurrencyState] = useState<InvoiceCurrency>(initial.currency);
  const [rateInput, setRateInput] = useState<string>(initial.rateInput);

  const setCurrency = (next: InvoiceCurrency) => {
    setCurrencyState(next);
    setRateInput(getDefaultRateFor(project, next));
  };

  const isRateFixed = !!existing;
  let fixedReason: string | null = null;
  if (existing) fixedReason = "Set when this invoice was first saved — it can't be changed.";
  else if (lock) fixedReason = `This project's invoices are locked to ${lock}.`;
  else if (!supported) fixedReason = "Other invoice currencies aren't available until the server is updated.";
  const isCurrencyFixed = fixedReason !== null;

  const rateError = validateExchangeRate(currency, rateInput);
  const selection: InvoiceCurrencySelection | null =
    rateError === null ? { currency, exchangeRateToINR: isForeignCurrency(currency) ? Number(rateInput) : 1 } : null;

  return { currency, rateInput, setCurrency, setRateInput, selection, rateError, isCurrencyFixed, isRateFixed, fixedReason };
}
