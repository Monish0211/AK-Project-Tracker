import type { SelectHTMLAttributes } from "react";
import { FIELD_BASE, FIELD_STATE } from "./fieldStyles";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Canonical select — same field chrome as Input, native chevron. */
export const Select = ({ invalid = false, className = "", children, ...rest }: SelectProps) => (
  <select
    className={`${FIELD_BASE} ${invalid ? FIELD_STATE.invalid : FIELD_STATE.default} ${className}`}
    {...rest}
  >
    {children}
  </select>
);
