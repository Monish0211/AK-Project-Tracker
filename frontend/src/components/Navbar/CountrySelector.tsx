import { Globe2 } from "lucide-react";
import { useCountry } from "../../auth/countryContextValue";

/**
 * Active-country selector (Global Multi-Country Phase 1). Lists only the countries the server says this account may use,
 * plus All Countries when it was explicitly granted. A single-country account sees its country as a label, with no
 * dropdown. Renders nothing while the feature is off. Choosing a country is a view change only.
 */
export function CountrySelector() {
  const { enabled, choices, active, activeLabel, selectCountry, locked, lockReason } = useCountry();

  if (!enabled || choices.length === 0) return null;

  if (choices.length === 1) {
    return (
      <div
        data-testid="country-label"
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-[13px] font-semibold text-[var(--text-primary)]"
        title="Your country"
      >
        <Globe2 size={14} aria-hidden="true" />
        <span>{activeLabel}</span>
      </div>
    );
  }

  return (
    <label
      className={`flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)] ${locked ? "opacity-70" : ""}`}
      title={locked ? (lockReason ?? "The country is locked on this page") : "Active country"}
    >
      <Globe2 size={14} aria-hidden="true" />
      <span className="sr-only">Active country</span>
      <select
        data-testid="country-selector"
        aria-label="Active country"
        value={active ?? ""}
        onChange={(e) => selectCountry(e.target.value)}
        disabled={locked}
        data-locked={locked ? "true" : undefined}
        className={`h-8 rounded-lg border border-[var(--border-color)] bg-transparent px-2 text-[13px] font-semibold outline-none ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default CountrySelector;
