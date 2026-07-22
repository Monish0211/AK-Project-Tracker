import React from "react";

interface FieldErrorProps {
  error?: string;
}

export const FieldError: React.FC<FieldErrorProps> = ({ error }) => {
  if (!error) return null;
  
  return (
    <p className="mt-1.5 text-[11px] font-semibold text-[var(--nu-danger)] animate-in fade-in slide-in-from-top-1">
      {error}
    </p>
  );
};
