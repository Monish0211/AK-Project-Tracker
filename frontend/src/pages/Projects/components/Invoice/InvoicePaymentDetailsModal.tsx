import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronDown, X } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Input } from "../../../../components/ui/Input";
import { Portal } from "../../../../components/ui/Portal";
import { Textarea } from "../../../../components/ui/Textarea";
import { usePmoToast } from "../../../../components/ui/usePmoToast";
import { ApiError } from "../../../../services/apiClient";
import {
  getInvoicePaymentOverview,
  previewInvoicePayment,
  recordInvoicePayment,
  reverseInvoicePayment,
} from "../../../../services/invoicePaymentService";
import type { InvoicePaymentOverviewDto } from "../../../../services/invoicePaymentService";
import { INVOICE_LINE_STATUS_LABEL, INVOICE_LINE_STATUS_TONE } from "./InvoiceCalculations";
import {
  DEDUCTION_CATEGORIES,
  MAX_REFERENCE_LENGTH,
  MAX_TEXT_LENGTH,
  NO_ERRORS,
  buildPaymentPayload,
  computeLiveSummary,
  countErrors,
  createInitialDraft,
  createSaveGuard,
  decimalPlacesFor,
  formatMoneyString,
  formatReviewDate,
  getDeductionCategory,
  inrEquivalent,
  isDraftDirty,
  mapServerErrors,
  newIdempotencyKey,
  normalizeMoney,
  referenceRate,
  validatePaymentDetails,
} from "./invoicePaymentDetails";
import type { AdjustmentDraft, DeductionCategory, InvoicePaymentContext, PaymentDetailsDraft, PaymentDetailsErrors, ReceiptDraft } from "./invoicePaymentDetails";
import { Field, InrReference, Notice } from "./PaymentFormParts";
import { PaymentHistoryPanel } from "./PaymentHistoryPanel";
import { InvoicePaymentGstPanel } from "./InvoicePaymentGstPanel";

/**
 * Record Payment - Invoice Settlement (Nov 2026). One compact screen:
 *   A invoice information (read only)  |  B payment received from bank  |  C deductions & adjustments (tabs)  |  D live settlement summary.
 *
 * Total Settled = bank amount received + every deduction; Outstanding = invoice amount - Total Settled, all in the invoice currency.
 * The summary on the right updates while typing (display only); the BACKEND recalculates and is the authority when Save runs. The
 * invoice becomes Partially Paid or Paid from that result - never by choosing a status. GST (Nov 2026) is shown read only from the GST
 * snapshot saved with the invoice: it is part of the invoice amount the settlement is measured against - never a deduction, never typed
 * here. Nothing is mandatory except that at least one amount must be entered. INR figures on a foreign invoice are reference only.
 * Closing never saves: with unsaved changes it asks first.
 */

interface Props {
  projectId: string;
  /** Figures the portal already shows - used before the server's own arrive. */
  context: InvoicePaymentContext;
  /** Shown under the invoice information when the popup was opened for a single line of a multi-line invoice. */
  scopeNote?: string;
  onClose: () => void;
  /** Called after a payment is saved or reversed, so the screen behind can reload the invoice (its status may have changed). */
  onPaymentChanged?: () => void;
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: InvoicePaymentOverviewDto };

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const todayIso = () => new Date().toISOString().slice(0, 10);

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

const statusLabelOf = (status: string): string => INVOICE_LINE_STATUS_LABEL[status as keyof typeof INVOICE_LINE_STATUS_LABEL] ?? status;

export function InvoicePaymentDetailsModal({ projectId, context, scopeNote, onClose, onPaymentChanged }: Props) {
  const baseId = useId();
  const { showToast } = usePmoToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const saveGuardRef = useRef(createSaveGuard());
  const reverseGuardRef = useRef(createSaveGuard());
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  const [overview, setOverview] = useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = useState<PaymentDetailsDraft>(() => createInitialDraft());
  const [baseline, setBaseline] = useState<PaymentDetailsDraft>(() => createInitialDraft());
  const [activeTab, setActiveTab] = useState<DeductionCategory>("TDS");
  const [showHistory, setShowHistory] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  const [serverErrors, setServerErrors] = useState<PaymentDetailsErrors>(NO_ERRORS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const data = overview.status === "ready" ? overview.data : null;
  const invoice = data?.invoice ?? null;
  const currency = invoice?.currency ?? context.currency;
  const canEdit = Boolean(invoice && invoice.canRecord && !invoice.recordBlockedReason);
  const dirty = isDraftDirty(draft, baseline);
  const busy = isSaving || reversingId !== null;

  const loadOverview = useCallback(async (): Promise<InvoicePaymentOverviewDto | null> => {
    try {
      const result = await getInvoicePaymentOverview(projectId, context.invoiceNo);
      setOverview({ status: "ready", data: result });
      return result;
    } catch (error) {
      setOverview({ status: "error", message: messageOf(error) });
      return null;
    }
  }, [projectId, context.invoiceNo]);

  // Load the invoice's persisted payments and the server's own figures when the popup opens.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getInvoicePaymentOverview(projectId, context.invoiceNo);
        if (cancelled) return;
        setOverview({ status: "ready", data: result });
      } catch (error) {
        if (!cancelled) setOverview({ status: "error", message: messageOf(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, context.invoiceNo]);

  // Return focus to whatever opened the popup (the status control) when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const validationContext = useMemo(() => ({ currency, todayIso: todayIso() }), [currency]);

  // INR reference figures for a foreign invoice - DISPLAY ONLY. Settlement never sees any of it.
  const invoiceRate = invoice?.exchangeRateToINR ?? "";
  const refRate = useMemo(() => (currency === "INR" ? null : referenceRate(invoiceRate, draft)), [currency, invoiceRate, draft]);
  const inrOf = (amount: string): string | null => {
    if (!refRate) return null;
    const value = inrEquivalent(amount, currency, refRate.rate);
    return value === null ? null : formatMoneyString(value, "INR");
  };
  const fmt = (value: string) => formatMoneyString(value, currency);

  const clientErrors = useMemo(() => validatePaymentDetails(draft, validationContext), [draft, validationContext]);
  const liveErrors = hasAttemptedSave ? clientErrors : NO_ERRORS;
  const errors = serverErrors.hasErrors ? serverErrors : liveErrors;
  const errorCount = countErrors(errors);

  const live = useMemo(
    () =>
      invoice && data
        ? computeLiveSummary({
            currency,
            invoiceAmount: invoice.invoiceAmount,
            previousBank: data.summary.bankReceived,
            previousDeductions: data.summary.deductions,
            previousByCategory: data.summary.deductionsByCategory,
            draft,
          })
        : null,
    [invoice, data, currency, draft]
  );
  const overSettled = live?.outcome === "INVALID";
  const nothingEntered = clientErrors.general.length > 0;
  const saveDisabled = !canEdit || busy || overSettled || nothingEntered || (clientErrors.hasErrors && hasAttemptedSave);

  // Any edit makes the previous server answer and the previous save attempt stale.
  const touched = useCallback(() => {
    setServerErrors(NO_ERRORS);
    setSaveError(null);
    setSavedMessage(null);
    idempotencyKeyRef.current = newIdempotencyKey();
  }, []);

  const updateReceipt = (patch: Partial<ReceiptDraft>) => {
    touched();
    setDraft((current) => ({ ...current, receipt: { ...current.receipt, ...patch } }));
  };
  const updateAdjustment = (id: string, patch: Partial<AdjustmentDraft>) => {
    touched();
    setDraft((current) => ({ ...current, adjustments: current.adjustments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  };

  const requestClose = () => {
    if (isSaving) return;
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current || active === headingRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const resetAfterServerChange = () => {
    const fresh = createInitialDraft();
    setDraft(fresh);
    setBaseline(fresh);
    setHasAttemptedSave(false);
    setServerErrors(NO_ERRORS);
    idempotencyKeyRef.current = newIdempotencyKey();
  };

  const handleSave = async () => {
    if (!invoice || !canEdit) return;
    setHasAttemptedSave(true);
    if (clientErrors.hasErrors || overSettled) return;
    if (!saveGuardRef.current.tryEnter()) return; // a second click while a save is in flight
    setIsSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    const built = buildPaymentPayload(draft, { projectId, invoiceNo: invoice.invoiceNo, currency });
    try {
      const result = await recordInvoicePayment(built.payload, idempotencyKeyRef.current);
      const status = result.newInvoiceStatus ?? result.overview.invoice.status;
      const message =
        status === "Paid"
          ? "Payment saved. The invoice is now Paid."
          : status === "PartiallyPaid"
            ? `Payment saved. The invoice is Partially Paid; ${formatMoneyString(result.overview.summary.outstanding, currency)} is still outstanding.`
            : "Payment saved.";
      setOverview({ status: "ready", data: result.overview });
      resetAfterServerChange();
      setSavedMessage(message);
      showToast({ type: "success", message });
      onPaymentChanged?.();
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const text = messageOf(error);
      if (status === 0) {
        // Timeout / network: the server may or may not have saved. A retry of THIS attempt is safe (same key).
        setSaveError(`${text} The payment may or may not have been saved - check the recorded payments before saving again.`);
        void loadOverview();
      } else if (status === 400 || status === 422) {
        setSaveError(text);
        try {
          const preview = await previewInvoicePayment(built.payload);
          if (!preview.valid) setServerErrors(mapServerErrors(preview.errors, built));
        } catch {
          /* the message above already explains the rejection */
        }
      } else if (status === 409) {
        setSaveError(text);
        void loadOverview();
        onPaymentChanged?.();
      } else {
        setSaveError(text);
      }
      showToast({ type: "error", message: text });
    } finally {
      setIsSaving(false);
      saveGuardRef.current.leave();
    }
  };

  const handleReverse = async (paymentId: string, reason: string) => {
    if (!reverseGuardRef.current.tryEnter()) return;
    setReversingId(paymentId);
    try {
      const result = await reverseInvoicePayment(paymentId, reason);
      setOverview({ status: "ready", data: result.overview });
      const message = "Payment reversed. The invoice status was recalculated.";
      setSavedMessage(message);
      showToast({ type: "success", message });
      onPaymentChanged?.();
    } catch (error) {
      showToast({ type: "error", message: messageOf(error) });
      void loadOverview();
    } finally {
      setReversingId(null);
      reverseGuardRef.current.leave();
    }
  };

  const titleId = `${baseId}-title`;
  const noticeId = `${baseId}-notice`;
  const currentStatus = invoice?.status ?? context.currentStatus;
  const moneyHint = `up to ${decimalPlacesFor(currency)} decimal places`;
  const activeEntry = draft.adjustments.find((a) => a.category === activeTab) ?? draft.adjustments[0]!;
  const activeConfig = getDeductionCategory(activeEntry.category);
  const activeErrors = errors.adjustments[activeEntry.id] ?? {};
  const enteredAmountOf = (entry: AdjustmentDraft): string | null => {
    const normalized = normalizeMoney(entry.amount, currency);
    return normalized === null || /^0+(\.0+)?$/.test(normalized) ? null : normalized;
  };
  const enteredDeductions = draft.adjustments.filter((entry) => enteredAmountOf(entry) !== null);
  const amountErrorTabs = new Set(draft.adjustments.filter((entry) => Object.keys(errors.adjustments[entry.id] ?? {}).length > 0).map((entry) => entry.category));

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4">
        {/* No click-outside close: a stray click must not discard typed values. */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={noticeId}
          aria-busy={busy}
          onKeyDown={handleKeyDown}
          className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--nu-border)] bg-[var(--nu-surface)] shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--nu-border)] px-5 py-3.5">
            <div>
              <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-[16px] font-bold text-[var(--nu-text)] outline-none">
                Record Payment &ndash; Invoice Settlement
              </h2>
              <p className="mt-0.5 text-[11.5px] text-[var(--nu-text-muted)]">Record the bank receipt and any deductions for this invoice. Everything is in the invoice currency.</p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close without saving"
              className="cursor-pointer rounded-lg p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
            >
              <X size={19} />
            </button>
          </div>

          {overview.status === "loading" && (
            <div className="px-5 py-10 text-center text-[12.5px] text-[var(--nu-text-muted)]" role="status" id={noticeId}>
              Loading payment details...
            </div>
          )}

          {overview.status === "error" && (
            <div className="space-y-4 px-5 py-6" id={noticeId}>
              <Notice tone="danger" role="alert">
                Could not load the payment details: {overview.message}
              </Notice>
              <div className="flex justify-end gap-2.5">
                <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setOverview({ status: "loading" });
                    void loadOverview();
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {data && invoice && live && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
              noValidate
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="nu-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {/* A. Invoice information (read only) */}
                <section aria-label="Invoice information">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-3 sm:grid-cols-3 lg:grid-cols-6">
                    <InfoCell label="Invoice no.">
                      <span className="font-mono">{context.invoiceNo}</span>
                    </InfoCell>
                    <InfoCell label="Invoice date">{context.invoiceDates.length === 0 ? "-" : context.invoiceDates.map(formatReviewDate).join(", ")}</InfoCell>
                    <InfoCell label="Project / PR">{context.prNo || "-"}</InfoCell>
                    <InfoCell label="Client">{context.client || "-"}</InfoCell>
                    <InfoCell label={invoice.gst.availability === "SNAPSHOT" && invoice.gst.status === "APPLICABLE" ? "Invoice value (incl. GST)" : "Invoice value"}>
                      <span data-testid="invoice-value">{fmt(invoice.invoiceAmount)}</span>
                      {inrOf(invoice.invoiceAmount) && <span className="block text-[10.5px] font-medium text-[var(--nu-text-muted)]">INR equivalent {inrOf(invoice.invoiceAmount)}</span>}
                    </InfoCell>
                    <InfoCell label="Currency / status">
                      <span className="flex max-w-full flex-wrap items-center gap-1.5">
                        <Badge tone="neutral" className="text-[10px]">{currency}</Badge>
                        <Badge tone={INVOICE_LINE_STATUS_TONE[currentStatus as keyof typeof INVOICE_LINE_STATUS_TONE] ?? "neutral"} dot className="text-[10px]">
                          {statusLabelOf(currentStatus)}
                        </Badge>
                      </span>
                    </InfoCell>
                  </dl>
                  {scopeNote && <p className="mt-1.5 text-[11.5px] text-[var(--nu-text-muted)]">{scopeNote}</p>}
                </section>

                <InvoicePaymentGstPanel gst={invoice.gst} fmt={fmt} />

                <Notice tone={canEdit ? "info" : "warning"} id={noticeId}>
                  {canEdit ? (
                    <>
                      The invoice becomes <strong>Partially Paid</strong> or <strong>Paid</strong> from what you save here: Total Settled = bank amount + deductions. Nothing is
                      required except at least one amount.
                    </>
                  ) : invoice.recordBlockedReason && invoice.canRecord && data.payments.length > 0 ? (
                    <>
                      {invoice.recordBlockedReason} To change its status (or cancel it), reverse the payment below first; the status is then recalculated.
                    </>
                  ) : invoice.recordBlockedReason ? (
                    <>{invoice.recordBlockedReason}</>
                  ) : (
                    <>You can view the recorded payments, but you do not have permission to record or reverse them.</>
                  )}
                </Notice>

                {savedMessage && (
                  <Notice tone="success" role="status">
                    {savedMessage}
                  </Notice>
                )}
                {saveError && (
                  <Notice tone="danger" role="alert">
                    {saveError}
                  </Notice>
                )}
                {errorCount > 0 && hasAttemptedSave && (
                  <div role="alert" className="rounded-[var(--nu-radius-md)] border border-[var(--nu-danger)] bg-[var(--nu-danger-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--nu-danger)]">
                    Please correct {errorCount} highlighted {errorCount === 1 ? "item" : "items"} before saving.
                    {errors.general.map((message) => (
                      <p key={message} className="mt-1 font-medium">
                        {message}
                      </p>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                  {/* Left column: B + C */}
                  <div className="min-w-0 space-y-4">
                    {canEdit && (
                      <>
                        <section aria-label="Payment received from bank" className="space-y-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] p-3.5">
                          <h3 className="text-[13px] font-extrabold text-[var(--nu-text)]">Payment Received from Bank</h3>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field
                              id={`${baseId}-bank-amount`}
                              label={`Amount received (${currency})`}
                              error={errors.receipt.amountReceived}
                              hint={`In ${currency}, ${moneyHint}.`}
                              extra={<InrReference inr={inrOf(draft.receipt.amountReceived)} />}
                            >
                              {(control) => (
                                <Input {...control} type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={draft.receipt.amountReceived} onChange={(e) => updateReceipt({ amountReceived: e.target.value })} />
                              )}
                            </Field>
                            <Field id={`${baseId}-bank-date`} label="Payment date" error={errors.receipt.paymentDate}>
                              {(control) => <Input {...control} type="date" max="9999-12-31" value={draft.receipt.paymentDate} onChange={(e) => updateReceipt({ paymentDate: e.target.value })} />}
                            </Field>
                            <Field id={`${baseId}-bank-ref`} label="Bank / transaction reference" error={errors.receipt.reference}>
                              {(control) => <Input {...control} type="text" autoComplete="off" maxLength={MAX_REFERENCE_LENGTH} value={draft.receipt.reference} onChange={(e) => updateReceipt({ reference: e.target.value })} />}
                            </Field>
                            <Field id={`${baseId}-bank-notes`} label="Notes" error={errors.receipt.notes}>
                              {(control) => <Textarea {...control} rows={1} maxLength={MAX_TEXT_LENGTH} value={draft.receipt.notes} onChange={(e) => updateReceipt({ notes: e.target.value })} />}
                            </Field>
                          </div>
                        </section>

                        <section aria-label="Deductions and adjustments" className="space-y-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] p-3.5">
                          <h3 className="text-[13px] font-extrabold text-[var(--nu-text)]">Deductions &amp; Adjustments</h3>
                          <div role="tablist" aria-label="Deduction types" className="flex flex-wrap gap-1.5">
                            {DEDUCTION_CATEGORIES.map((category) => {
                              const entry = draft.adjustments.find((a) => a.category === category.value)!;
                              const amount = enteredAmountOf(entry);
                              const selected = activeTab === category.value;
                              return (
                                <button
                                  key={category.value}
                                  type="button"
                                  role="tab"
                                  id={`${baseId}-tab-${category.value}`}
                                  aria-selected={selected}
                                  aria-controls={`${baseId}-panel`}
                                  data-testid={`deduction-tab-${category.value}`}
                                  onClick={() => setActiveTab(category.value)}
                                  className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] font-semibold transition ${
                                    selected
                                      ? "border-[var(--nu-accent)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]"
                                      : amountErrorTabs.has(category.value)
                                        ? "border-[var(--nu-danger)] text-[var(--nu-danger)]"
                                        : "border-[var(--nu-border)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)]"
                                  }`}
                                >
                                  <span className="block">{category.label}</span>
                                  {amount !== null && (
                                    <span className="block text-[10.5px] font-bold" data-testid={`deduction-tab-amount-${category.value}`}>
                                      {fmt(amount)}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${activeEntry.category}`} className="space-y-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] p-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <Field
                                id={`${baseId}-${activeEntry.id}-amount`}
                                label={`${activeConfig.amountLabel} (${currency})`}
                                error={activeErrors.amount}
                                hint={`In ${currency}, ${moneyHint}.`}
                                extra={<InrReference inr={inrOf(activeEntry.amount)} />}
                              >
                                {(control) => (
                                  <Input {...control} type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={activeEntry.amount} onChange={(e) => updateAdjustment(activeEntry.id, { amount: e.target.value })} />
                                )}
                              </Field>
                              {activeConfig.kind === "fx" && currency !== "INR" && (
                                <Field id={`${baseId}-${activeEntry.id}-rate`} label="Applicable exchange rate (optional)" error={activeErrors.exchangeRate} hint="INR per 1 unit. Used only for the INR reference figures.">
                                  {(control) => (
                                    <Input {...control} type="text" inputMode="decimal" autoComplete="off" value={activeEntry.exchangeRate} onChange={(e) => updateAdjustment(activeEntry.id, { exchangeRate: e.target.value })} />
                                  )}
                                </Field>
                              )}
                              {activeConfig.kind === "retained" && (
                                <>
                                  <Field id={`${baseId}-${activeEntry.id}-release`} label="Expected release date" error={activeErrors.expectedReleaseDate}>
                                    {(control) => (
                                      <Input {...control} type="date" max="9999-12-31" value={activeEntry.expectedReleaseDate} onChange={(e) => updateAdjustment(activeEntry.id, { expectedReleaseDate: e.target.value })} />
                                    )}
                                  </Field>
                                  <Field id={`${baseId}-${activeEntry.id}-reminder`} label="Reminder date" error={activeErrors.reminderDate}>
                                    {(control) => (
                                      <Input {...control} type="date" max="9999-12-31" value={activeEntry.reminderDate} onChange={(e) => updateAdjustment(activeEntry.id, { reminderDate: e.target.value })} />
                                    )}
                                  </Field>
                                </>
                              )}
                            </div>
                          </div>

                          <div aria-label="Key deductions" className="text-[11.5px] text-[var(--nu-text-muted)]">
                            <span className="font-semibold text-[var(--nu-text)]">Key deductions entered: </span>
                            {enteredDeductions.length === 0 ? (
                              "none"
                            ) : (
                              <span className="inline-flex flex-wrap gap-1.5 align-middle">
                                {enteredDeductions.map((entry) => (
                                  <button key={entry.id} type="button" onClick={() => setActiveTab(entry.category)} className="cursor-pointer rounded-full border border-[var(--nu-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)]">
                                    {getDeductionCategory(entry.category).label} {fmt(enteredAmountOf(entry)!)}
                                  </button>
                                ))}
                              </span>
                            )}
                          </div>
                        </section>
                      </>
                    )}

                    <section aria-label="Recorded payments" className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)]">
                      <button
                        type="button"
                        onClick={() => setShowHistory((open) => !open)}
                        aria-expanded={showHistory}
                        className="flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left text-[12.5px] font-bold text-[var(--nu-text)]"
                      >
                        <span>Recorded payments ({data.payments.length})</span>
                        <ChevronDown size={16} className={`transition ${showHistory ? "rotate-180" : ""}`} aria-hidden="true" />
                      </button>
                      {showHistory && (
                        <div className="border-t border-[var(--nu-border)] p-3.5">
                          <PaymentHistoryPanel
                            referenceRate={refRate?.rate ?? null}
                            payments={data.payments}
                            currency={currency}
                            canReverse={invoice.canRecord}
                            busyId={reversingId}
                            onReverse={(id, reason) => void handleReverse(id, reason)}
                          />
                        </div>
                      )}
                    </section>
                  </div>

                  {/* D. Settlement summary: stays in view beside the form on desktop, stacks below on small screens */}
                  <aside aria-label="Settlement summary" className="min-w-0 lg:sticky lg:top-0 lg:self-start">
                    <div className="space-y-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-3.5">
                      <h3 className="text-[13px] font-extrabold text-[var(--nu-text)]">Settlement Summary</h3>
                      <dl className="space-y-1.5 text-[12px]" data-testid="settlement-summary">
                        <SummaryRow
                          label={invoice.gst.availability === "SNAPSHOT" && invoice.gst.status === "APPLICABLE" ? "Invoice amount (incl. GST)" : "Invoice amount"}
                          value={fmt(live.invoiceAmount)}
                          strong
                        />
                        <SummaryRow label="Previously received from bank" value={fmt(live.previousBank)} />
                        <SummaryRow label="Current bank receipt" value={fmt(live.currentBank)} />
                        <SummaryRow label="Total bank received" value={fmt(live.totalBank)} />
                        <SummaryRow label="Previous deductions" value={fmt(live.previousDeductions)} />
                        <SummaryRow label="Current deductions" value={fmt(live.currentDeductions)} />
                        <SummaryRow label="Total eligible deductions" value={fmt(live.totalDeductions)} />
                        <div className="my-1 border-t border-[var(--nu-border)]" />
                        <SummaryRow label="Total settled" value={fmt(live.totalSettled)} strong testId="total-settled" />
                        <SummaryRow label="Outstanding" value={fmt(live.outstanding)} strong testId="outstanding" />
                        <SummaryRow
                          label="Calculated status"
                          value={live.outcome === "SETTLED" ? "Paid" : live.outcome === "PARTIAL" ? "Partially Paid" : live.outcome === "INVALID" ? "Not allowed" : statusLabelOf(currentStatus)}
                          strong
                          testId="calculated-status"
                        />
                      </dl>
                      {live.outcome === "SETTLED" && (
                        <Notice tone="success" role="status">
                          {canEdit ? (
                            <>
                              Fully settled. Saving marks the invoice <strong>Paid</strong>.
                            </>
                          ) : (
                            <>This invoice is fully settled.</>
                          )}
                        </Notice>
                      )}
                      {live.outcome === "PARTIAL" && (
                        <Notice tone="warning" role="status">
                          {canEdit ? (
                            <>
                              Saving marks the invoice <strong>Partially Paid</strong>. {fmt(live.outstanding)} stays outstanding.
                            </>
                          ) : (
                            <>Partially settled. {fmt(live.outstanding)} is still outstanding.</>
                          )}
                        </Notice>
                      )}
                      {live.outcome === "INVALID" && live.excessMessage && (
                        <Notice tone="danger" role="alert">
                          {live.excessMessage} Reduce an amount to continue.
                        </Notice>
                      )}
                      {live.outcome === "NONE" && <p className="text-[11.5px] text-[var(--nu-text-muted)]">Enter an amount to see the resulting status. The invoice status stays unchanged until then.</p>}
                      {refRate && <p className="text-[11px] text-[var(--nu-text-muted)]">INR equivalents are reference only, at the {refRate.source === "applicable" ? "Applicable exchange rate you entered" : "exchange rate recorded on the invoice"}. Settlement is in {currency}.</p>}
                    </div>
                  </aside>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-[var(--nu-border)] px-5 py-3">
                <Button type="button" variant="secondary" size="sm" disabled={isSaving} onClick={requestClose}>
                  Cancel
                </Button>
                {canEdit && (
                  <Button type="submit" variant="primary" size="sm" disabled={saveDisabled}>
                    {isSaving ? "Saving..." : "Save Payment"}
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmClose}
        variant="danger"
        title="Discard unsaved payment details?"
        message="You have entered payment details that have not been saved. Closing now will discard them."
        confirmLabel="Discard and close"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </Portal>
  );
}

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-medium text-[var(--nu-text-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-[12px] font-semibold text-[var(--nu-text)]">{children}</dd>
    </div>
  );
}

function SummaryRow({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--nu-text-muted)]">{label}</dt>
      <dd className={`text-right ${strong ? "font-extrabold text-[var(--nu-text)]" : "font-semibold text-[var(--nu-text-secondary)]"}`} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
