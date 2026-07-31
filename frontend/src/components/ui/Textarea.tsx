import type { TextareaHTMLAttributes } from "react";
import { FIELD_STATE } from "./fieldStyles";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const TEXTAREA_BASE =
  "w-full min-h-[4.5rem] rounded-[var(--nu-radius-md)] border bg-[var(--nu-surface)] px-3 py-2 text-[length:var(--nu-text-base)] text-[var(--nu-text)] outline-none transition-colors duration-150 resize-y placeholder:text-[var(--nu-text-muted)] disabled:cursor-not-allowed disabled:bg-[var(--nu-surface-alt)] disabled:text-[var(--nu-text-muted)]";

/** Canonical textarea — same field chrome/focus behavior as Input, resizable. */
export const Textarea = ({ invalid = false, className = "", ...rest }: TextareaProps) => (
  <textarea className={`${TEXTAREA_BASE} ${invalid ? FIELD_STATE.invalid : FIELD_STATE.default} ${className}`} {...rest} />
);
