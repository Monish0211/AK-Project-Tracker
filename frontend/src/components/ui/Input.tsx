import type { InputHTMLAttributes } from "react";
import { FIELD_BASE, FIELD_STATE } from "./fieldStyles";
import { DATE_INPUT_MAX, DATE_INPUT_MIN } from "../../utils/dateInputValidation";

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
  <input
    className={`${FIELD_BASE} ${invalid ? FIELD_STATE.invalid : FIELD_STATE.default} ${className}`}
    // Date fields: keep the calendar inside the range the backend accepts
    // (1900–2100). A caller's own min/max still wins. Typed years can bypass
    // min/max, so forms also check with utils/dateInputValidation.ts.
    {...(rest.type === "date" && { min: DATE_INPUT_MIN, max: DATE_INPUT_MAX })}
    {...rest}
  />
);
