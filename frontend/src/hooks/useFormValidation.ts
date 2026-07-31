import { useState, useCallback } from "react";

export function useFormValidation<T>() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback(
    (data: T, validationFn: (data: T) => Record<string, string>): boolean => {
      const newErrors = validationFn(data);
      setErrors(newErrors);

      const errorKeys = Object.keys(newErrors);
      if (errorKeys.length > 0) {
        // Find the first error element in DOM using data-field
        setTimeout(() => {
          const firstErrorEl = document.querySelector(
            `[data-field="${errorKeys[0]}"]`
          ) as HTMLElement;
          if (firstErrorEl) {
            firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
            firstErrorEl.focus();
          }
        }, 50);
        return false;
      }
      return true;
    },
    []
  );

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  return { errors, validate, clearError, clearAllErrors };
}
