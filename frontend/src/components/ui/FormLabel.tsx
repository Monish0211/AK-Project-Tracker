import React from "react";

export const RequiredAsterisk = () => (
  <span className="text-red-500 ml-1" aria-hidden="true">
    *
  </span>
);

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const FormLabel: React.FC<FormLabelProps> = ({ required, children, className = "", ...props }) => {
  return (
    <label className={`block text-[11.5px] font-medium text-[var(--nu-text-secondary)] mb-1.5 ${className}`} {...props}>
      {children}
      {required && <RequiredAsterisk />}
    </label>
  );
};
