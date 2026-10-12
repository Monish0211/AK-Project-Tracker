import { useState } from "react";
import type { Project } from "../../../../types/Project";
import { ApiError } from "../../../../services/apiClient";
import { checkInvoiceNumberAvailability } from "../../../../services/invoiceService";
import { NEW_INVOICE_CYCLE } from "./InvoiceCalculations";

export interface InvoiceNumberFieldState {
  /** True when this form starts a NEW invoice (number entered by the user); false when it reopens an existing one (number fixed). */
  isNew: boolean;
  value: string;
  setValue: (value: string) => void;
  error: string | null;
  /** A save-time availability check is in flight — the Save button must stay disabled (duplicate-submission guard). */
  checking: boolean;
  /** Something has been typed (for a new invoice) — feeds the form's canSave. */
  hasValue: boolean;
  /**
   * Validate for saving. Resolves to the invoice number to write on every
   * line, or null (with `error` set) when the form must stay open. Never
   * clears or rewrites what the user typed.
   */
  resolveForSave: () => Promise<string | null>;
}

const normalize = (value: string) => value.trim().toUpperCase();

/**
 * Manual invoice numbering (Oct 2026) — the Invoice Number field shared by
 * all four Raise Invoice workspaces. Users enter their Tally invoice number;
 * the portal never generates or replaces it. For a new invoice the number
 * must be unused portal-wide (compared ignoring letter case and outer
 * spaces) — checked locally against this project's invoices (any status,
 * Cancelled included), then against the server before the form closes so a
 * duplicate never loses what was typed. The server re-checks on the actual
 * save (invoice.service.ts's registerInvoiceNumberForLine()).
 */
export function useInvoiceNumberField(project: Project, invoiceNo: string): InvoiceNumberFieldState {
  const isNew = invoiceNo === NEW_INVOICE_CYCLE;
  const [value, setRawValue] = useState(isNew ? "" : invoiceNo);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const setValue = (next: string) => {
    setRawValue(next);
    setError(null);
  };

  const resolveForSave = async (): Promise<string | null> => {
    if (!isNew) return invoiceNo;
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter the invoice number exactly as issued in Tally.");
      return null;
    }
    const usedHere = (project.invoiceItems ?? []).some((item) =>
      (item.invoices ?? []).some((line) => normalize(line.invoiceNo) === normalize(trimmed))
    );
    if (usedHere) {
      setError(`"${trimmed}" is already used by an invoice in this project (including cancelled invoices).`);
      return null;
    }
    setChecking(true);
    try {
      const result = await checkInvoiceNumberAvailability(project.id, trimmed);
      if (!result.available) {
        setError(`"${trimmed}" is already used by another invoice. Check the number in Tally.`);
        return null;
      }
      return trimmed;
    } catch (caught) {
      // A backend that predates manual numbering has no availability route
      // (404) and accepts any number on save — proceed exactly as before.
      if (caught instanceof ApiError && caught.status === 404) return trimmed;
      setError(
        caught instanceof ApiError && caught.status >= 400 && caught.status < 500
          ? caught.message
          : "Couldn't verify the invoice number right now. Please try again."
      );
      return null;
    } finally {
      setChecking(false);
    }
  };

  return { isNew, value, setValue, error, checking, hasValue: !isNew || value.trim() !== "", resolveForSave };
}
