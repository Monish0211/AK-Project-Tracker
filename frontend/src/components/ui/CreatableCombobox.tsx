import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent } from "react";
import { Plus, Check } from "lucide-react";

interface CreatableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onCreateOption: (value: string) => string;
  entityLabel: string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

const MAX_VISIBLE_OPTIONS = 8;

/**
 * Searchable "type to filter, or create a new one" combobox — replaces
 * plain <select> pickers wherever the option list is an open-ended master
 * list (e.g. Department / Reporting Manager sourced from the Manpower
 * module) rather than a small fixed enum. Free typing + arrow-key
 * navigation + Enter-to-select, with an inline confirm step before a brand
 * new option is committed to the master list.
 *
 * Internal `query` text is seeded once from `value` and not re-synced via
 * effect — callers that need a fresh reset (e.g. switching between Add mode
 * and a different Edit user) should pass a new `key` to remount this
 * component, per React's usual "reset state via key" pattern.
 */
export const CreatableCombobox = ({
  value,
  onChange,
  options,
  onCreateOption,
  entityLabel,
  placeholder = "Type to search...",
  emptyMessage = "No Results Found",
  disabled = false,
  ...rest
}: CreatableComboboxProps) => {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [pendingCreate, setPendingCreate] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((opt) => opt.toLowerCase().includes(normalizedQuery)).slice(0, MAX_VISIBLE_OPTIONS)
    : options.slice(0, MAX_VISIBLE_OPTIONS);

  const exactMatch = options.some((opt) => opt.toLowerCase() === normalizedQuery);
  const canCreate = query.trim() !== "" && !exactMatch;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setPendingCreate(null);
        setQuery(value);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [value]);

  const commitSelection = (selected: string) => {
    setQuery(selected);
    onChange(selected);
    setIsOpen(false);
    setPendingCreate(null);
  };

  const confirmCreate = () => {
    if (!pendingCreate) return;
    const created = onCreateOption(pendingCreate);
    commitSelection(created);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    const rowCount = filtered.length + (canCreate ? 1 : 0);

    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setIsOpen(true);
      setHighlightedIndex(0);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (rowCount === 0 ? 0 : (prev + 1) % rowCount));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (rowCount === 0 ? 0 : (prev - 1 + rowCount) % rowCount));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (pendingCreate) {
        confirmCreate();
        return;
      }
      if (highlightedIndex < filtered.length) {
        if (filtered[highlightedIndex]) commitSelection(filtered[highlightedIndex]);
      } else if (canCreate) {
        setPendingCreate(query.trim());
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setPendingCreate(null);
      setQuery(value);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={rest["aria-label"]}
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        onFocus={() => {
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(0);
          setPendingCreate(null);
        }}
        onKeyDown={handleKeyDown}
        className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 disabled:opacity-60 disabled:cursor-not-allowed"
      />

      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] shadow-[var(--nu-shadow-md)] max-h-56 overflow-y-auto nu-scrollbar py-1">
          {pendingCreate ? (
            <div className="p-2.5 space-y-2">
              <p className="text-[11.5px] text-[var(--nu-text-secondary)] leading-snug">
                Add <span className="font-semibold text-[var(--nu-text)]">"{pendingCreate}"</span> as a new {entityLabel}?
              </p>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPendingCreate(null)}
                  className="px-2 py-1 rounded-[var(--nu-radius-md)] text-[11px] font-semibold text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={confirmCreate}
                  className="px-2 py-1 rounded-[var(--nu-radius-md)] text-[11px] font-semibold bg-[var(--nu-accent)] text-white hover:bg-[var(--nu-accent-strong)] cursor-pointer"
                >
                  Confirm
                </button>
              </div>
            </div>
          ) : (
            <>
              {filtered.length === 0 && !canCreate && (
                <p className="px-3 py-2.5 text-[12px] text-[var(--nu-text-muted)]">{emptyMessage}</p>
              )}
              {filtered.map((opt, idx) => (
                <button
                  key={opt}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitSelection(opt)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] cursor-pointer ${
                    idx === highlightedIndex ? "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]" : "text-[var(--nu-text)]"
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {opt === value && <Check size={13} className="shrink-0" />}
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPendingCreate(query.trim())}
                  onMouseEnter={() => setHighlightedIndex(filtered.length)}
                  className={`w-full flex items-center gap-1.5 px-3 py-2 text-left text-[12.5px] font-medium cursor-pointer border-t border-[var(--nu-border)] ${
                    filtered.length === highlightedIndex ? "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]" : "text-[var(--nu-accent)]"
                  }`}
                >
                  <Plus size={13} className="shrink-0" />
                  <span className="truncate">Create "{query.trim()}"</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CreatableCombobox;
