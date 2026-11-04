import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { FieldError } from "../../../../components/ui/FieldError";
import { FormLabel } from "../../../../components/ui/FormLabel";

/**
 * Small presentational atoms shared by the Invoice Payment Details popup and its history panel (extracted from the popup so
 * the file that holds the workflow stays about the workflow). No state, no network.
 */

export interface ControlProps {
  id: string;
  invalid: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
}

/** Label + control + hint + inline error, wired together for assistive technology. */
export function Field({
  id,
  label,
  required,
  error,
  hint,
  extra,
  className = "",
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
  /** Anything shown directly under the control (e.g. an INR reference figure). */
  extra?: ReactNode;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <FormLabel htmlFor={id} required={required}>
        {label}
      </FormLabel>
      {children({
        id,
        invalid: Boolean(error),
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required ? true : undefined,
      })}
      {extra}
      {hint && (
        <p id={hintId} className="mt-1 text-[11px] text-[var(--nu-text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <div id={errorId}>
          <FieldError error={error} />
        </div>
      )}
    </div>
  );
}

export function SectionHeading({ letter, title, subtitle }: { letter: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--nu-accent-soft)] text-[11px] font-extrabold text-[var(--nu-accent)]"
      >
        {letter}
      </span>
      <div>
        <h3 className="text-[13px] font-extrabold text-[var(--nu-text)]">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11.5px] text-[var(--nu-text-muted)]">{subtitle}</p>}
      </div>
    </div>
  );
}

export type NoticeTone = "info" | "warning" | "success" | "danger";

export function Notice({ tone, children, id, role }: { tone: NoticeTone; children: ReactNode; id?: string; role?: "alert" | "status" }) {
  const palette: Record<NoticeTone, string> = {
    warning: "border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    info: "border-sky-300/70 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
    success: "border-emerald-300/70 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    danger: "border-[var(--nu-danger)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)]",
  };
  const Icon = tone === "warning" || tone === "danger" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div id={id} role={role} className={`flex items-start gap-2 rounded-[var(--nu-radius-md)] border px-3 py-2.5 text-[12px] leading-relaxed ${palette[tone]}`}>
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-[var(--nu-text-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-[12.5px] font-semibold text-[var(--nu-text)]">{children}</dd>
    </div>
  );
}

/**
 * The INR reference figure shown under / beside a foreign-currency amount ("INR equivalent: ₹4,50,000.00"). INFORMATION ONLY: it
 * is derived from the amount typed in the invoice currency and a rate, is never sent anywhere, and is never added to anything.
 * Renders nothing when there is no valid amount yet.
 */
export function InrReference({ inr }: { inr: string | null }) {
  if (inr === null) return null;
  return (
    <p className="mt-1 text-[11.5px] font-medium text-[var(--nu-text-secondary)]" data-testid="inr-equivalent">
      INR equivalent (reference only): <span className="font-semibold text-[var(--nu-text)]">{inr}</span>
    </p>
  );
}
