interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
  "aria-label"?: string;
}

/**
 * A real pill switch — no precedent existed anywhere in the app (toggles
 * were previously either native checkboxes or custom tile buttons; see
 * UserDrawer.tsx's Module Access / Approval Rights tiles, which keep their
 * own existing look deliberately). Use this for standalone on/off controls
 * like Account Security's Account Lock / Two-Factor Authentication, where a
 * tile-button would be visual overkill for a single boolean.
 */
export const Toggle = ({ checked, onChange, disabled = false, size = "md", label, ...rest }: ToggleProps) => {
  const trackClass = size === "sm" ? "w-8 h-[18px]" : "w-10 h-[22px]";
  const knobClass = size === "sm" ? "w-3.5 h-3.5" : "w-4.5 h-4.5";
  const knobTranslate = size === "sm" ? (checked ? "translate-x-[16px]" : "translate-x-0.5") : checked ? "translate-x-[20px]" : "translate-x-0.5";

  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-label"] ?? label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${trackClass} ${
        checked ? "bg-[var(--nu-accent)]" : "bg-[var(--nu-border-strong)]"
      }`}
    >
      <span
        className={`inline-block ${knobClass} rounded-full bg-white shadow-xs transform transition-transform duration-200 ${knobTranslate}`}
      />
    </button>
  );

  if (!label) return control;

  return (
    <label className={`flex items-center justify-between gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="text-[12px] text-[var(--nu-text-secondary)]">{label}</span>
      {control}
    </label>
  );
};

export default Toggle;
