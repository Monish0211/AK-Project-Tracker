/** Canonical field chrome shared by Input/Select/Textarea. */
export const FIELD_BASE =
  "w-full h-10 rounded-[var(--nu-radius-md)] border bg-[var(--nu-surface)] px-3 text-[length:var(--nu-text-base)] text-[var(--nu-text)] outline-none transition-colors duration-150 placeholder:text-[var(--nu-text-muted)] disabled:cursor-not-allowed disabled:bg-[var(--nu-surface-alt)] disabled:text-[var(--nu-text-muted)]";

export const FIELD_STATE = {
  default:
    "border-[var(--nu-border)] hover:border-[var(--nu-border-strong)] focus:border-[var(--nu-accent)] focus:ring-2 focus:ring-[var(--nu-accent)]/20",
  invalid: "border-[var(--nu-danger)] focus:border-[var(--nu-danger)] focus:ring-2 focus:ring-[var(--nu-danger)]/20",
};
