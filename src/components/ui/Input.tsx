import type { InputHTMLAttributes } from "react";
import { FIELD_BASE, FIELD_STATE } from "./fieldStyles";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * Canonical text input — replaces the six independently-drifting `fieldClass`
 * consts (different heights, font sizes, focus-ring opacities) found across
 * Timesheets/GeneralInfoCard/QuantityCard/ExpenseBudgetCard/ProjectLeadershipCard/
 * PaymentMilestoneCard. Pair with FormLabel/FieldError as before — this is
 * just the field itself, not a label+field+error bundle.
 */
export const Input = ({ invalid = false, className = "", ...rest }: InputProps) => (
  <input className={`${FIELD_BASE} ${invalid ? FIELD_STATE.invalid : FIELD_STATE.default} ${className}`} {...rest} />
);
