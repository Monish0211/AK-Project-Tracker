import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, Check } from "lucide-react";

interface Props {
  label: string;
  placeholder: string;
  value: string; // "ALL" or specific selected item
  onChange: (val: string) => void;
  options: string[];
}

export function SearchableAutocomplete({ label, placeholder, value, onChange, options }: Props) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync internal query when value changes externally (e.g. Reset Filters)
  useEffect(() => {
    if (value === "ALL" || !value) {
      setQuery("");
    } else {
      setQuery(value);
    }
  }, [value]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter matching suggestions
  const suggestions = useMemo(() => {
    if (!query.trim() || query === value) {
      return options.slice(0, 12);
    }
    const q = query.toLowerCase();
    const matches = options.filter((opt) => opt.toLowerCase().includes(q));
    return matches.slice(0, 15);
  }, [options, query, value]);

  const handleSelect = (item: string) => {
    onChange(item);
    setQuery(item);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("ALL");
    setQuery("");
    setIsOpen(false);
  };

  const isFiltered = value !== "ALL" && Boolean(value);

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] mb-0.5">
        {label}
      </label>

      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--nu-text-muted)] pointer-events-none" />

        <input
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            if (!e.target.value.trim()) {
              onChange("ALL");
            }
          }}
          placeholder={placeholder}
          className={`w-full pl-8 pr-7 py-1.5 bg-[var(--nu-surface-alt)] border rounded-lg text-xs text-[var(--nu-text)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-accent)] ${
            isFiltered ? "border-[var(--nu-accent)] font-bold text-[var(--nu-accent)]" : "border-[var(--nu-border)]"
          }`}
        />

        {isFiltered ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-2.5 text-[var(--nu-text-muted)] hover:text-[var(--nu-text)] cursor-pointer"
            title="Clear filter"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-xl shadow-xl z-50 nu-scrollbar text-xs">
          <div
            onClick={() => handleSelect("ALL")}
            className={`p-2 px-3 flex items-center justify-between hover:bg-[var(--nu-surface-alt)] cursor-pointer border-b border-[var(--nu-border)]/40 ${
              value === "ALL" ? "font-bold text-[var(--nu-accent)] bg-[var(--nu-surface-alt)]/50" : "text-[var(--nu-text-muted)]"
            }`}
          >
            <span>All {label}s</span>
            {value === "ALL" && <Check size={12} />}
          </div>

          {suggestions.length === 0 ? (
            <div className="p-3 text-center text-[11px] text-[var(--nu-text-muted)] italic">
              No matching {label.toLowerCase()}s found
            </div>
          ) : (
            suggestions.map((item) => {
              const isSelected = value === item;
              return (
                <div
                  key={item}
                  onClick={() => handleSelect(item)}
                  className={`p-2 px-3 flex items-center justify-between hover:bg-[var(--nu-surface-alt)] cursor-pointer transition ${
                    isSelected ? "font-bold text-[var(--nu-accent)] bg-[var(--nu-surface-alt)]/60" : "text-[var(--nu-text)]"
                  }`}
                >
                  <span className="truncate pr-2">{item}</span>
                  {isSelected && <Check size={12} className="shrink-0 text-[var(--nu-accent)]" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
