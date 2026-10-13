import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, Link2Off, Loader2, UserX } from "lucide-react";
import type { Project } from "../../../types/Project";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Portal } from "../../../components/ui/Portal";
import { ApiError } from "../../../services/apiClient";
import {
  getPmoCoordinatorOptions,
  PMO_COORDINATOR_STATUS_LABELS,
  type PmoCoordinatorOption,
} from "../../../services/pmoCoordinatorService";

interface Props {
  project: Project;
  setProject:
    | Dispatch<SetStateAction<Project>>
    | ((updater: (prev: Project) => Project) => void);
  hasError?: boolean;
  /** Shows the "not linked to an account" hint for legacy text-only coordinators. Off for PR Requests (which stay text-only). */
  showLinkHint?: boolean;
  /** Shows the current coordinator without allowing a change. */
  disabled?: boolean;
}

/**
 * General Information → PMO Coordinator (Oct 2026). Lists the Settings
 * registry with live account eligibility. Only an eligible entry can be
 * chosen; choosing one records its id (pmoCoordinatorEntryId) so the backend
 * can re-validate it and link that account to the project. An ineligible
 * entry opens the "PMO Account Not Available" popup and changes nothing.
 * Typing only filters the list — free text is never saved as the
 * coordinator, so a matching name alone can never grant access.
 */
export const PmoCoordinatorPicker = ({
  project,
  setProject,
  hasError,
  showLinkHint = true,
  disabled = false,
}: Props) => {
  const [options, setOptions] = useState<PmoCoordinatorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(project.pmoCoordinator || "");
  // Follow outside changes to the saved value (e.g. the project finishing
  // loading) — adjusted during render, React's recommended alternative to a
  // syncing effect.
  const [shownValue, setShownValue] = useState(project.pmoCoordinator || "");
  if ((project.pmoCoordinator || "") !== shownValue) {
    setShownValue(project.pmoCoordinator || "");
    setQuery(project.pmoCoordinator || "");
  }
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [unavailable, setUnavailable] = useState<PmoCoordinatorOption | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    getPmoCoordinatorOptions()
      .then((items) => {
        if (isMounted) setOptions(items);
      })
      .catch((err) => {
        if (isMounted)
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Could not load PMO Coordinators.",
          );
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Typing never changes the saved value: leaving the field restores it.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setQuery(project.pmoCoordinator || "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [project.pmoCoordinator]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // The current value in the box (unchanged) shows the whole list.
    if (!q || q === (project.pmoCoordinator || "").trim().toLowerCase())
      return options;
    return options.filter(
      (o) =>
        o.displayName.toLowerCase().includes(q) ||
        o.email.toLowerCase().includes(q),
    );
  }, [query, options, project.pmoCoordinator]);

  const choose = (option: PmoCoordinatorOption) => {
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (!option.selectable) {
      setQuery(project.pmoCoordinator || "");
      setUnavailable(option);
      return;
    }
    setQuery(option.displayName);
    setProject((prev) => ({
      ...prev,
      pmoCoordinator: option.displayName,
      pmoCoordinatorEntryId: option.id,
    }));
  };

  const restoreSavedValue = () => {
    setIsOpen(false);
    setHighlightedIndex(-1);
    setQuery(project.pmoCoordinator || "");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape — and Enter with nothing to choose — always put back the saved
    // value, so typed text never looks like it was accepted.
    if (e.key === "Escape") {
      e.preventDefault();
      restoreSavedValue();
      return;
    }
    if (e.key === "Enter" && (!isOpen || filtered.length === 0)) {
      e.preventDefault();
      restoreSavedValue();
      return;
    }
    if (!isOpen || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filtered.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filtered.length - 1,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option =
        filtered[highlightedIndex] ??
        (filtered.length === 1 ? filtered[0] : undefined);
      if (option) choose(option);
      else restoreSavedValue();
    }
  };

  // The current coordinator is linked when the form picked an entry this
  // session, or the saved project already has a coordinator account.
  const isLinked = Boolean(
    project.pmoCoordinatorEntryId || project.pmoCoordinatorUserId,
  );
  const currentOption = project.pmoCoordinatorEntryId
    ? options.find((o) => o.id === project.pmoCoordinatorEntryId)
    : project.pmoCoordinatorUserId
      ? options.find((o) => o.accountId === project.pmoCoordinatorUserId)
      : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => !disabled && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        invalid={hasError}
        disabled={disabled}
        placeholder={
          loading ? "Loading PMO Coordinators..." : "Search PMO Coordinator..."
        }
      />

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 z-[100] mt-2.5 max-h-72 overflow-y-auto rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] py-1 shadow-[var(--nu-shadow-md)] nu-scrollbar">
          {loading ? (
            <p className="flex items-center gap-2 px-3.5 py-2 text-[12.5px] text-[var(--nu-text-muted)]">
              <Loader2 size={13} className="animate-spin" /> Loading...
            </p>
          ) : loadError ? (
            <p className="px-3.5 py-2 text-[12.5px] text-[var(--nu-danger)]">
              {loadError}
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3.5 py-2 text-[12.5px] text-[var(--nu-text-muted)]">
              No matching PMO Coordinator found
            </p>
          ) : (
            filtered.map((option, index) => {
              const isHighlighted = index === highlightedIndex;
              return (
                <button
                  key={option.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  title={
                    option.selectable ? option.email : option.statusMessage
                  }
                  className={`w-full flex items-center justify-between gap-2 text-left px-3.5 py-2 text-[12.5px] transition-colors duration-100 ${
                    isHighlighted ? "bg-[var(--nu-surface-alt)]" : ""
                  } ${
                    option.selectable
                      ? "text-[var(--nu-text)] hover:text-[var(--nu-accent)] cursor-pointer"
                      : "text-[var(--nu-text-muted)] cursor-help"
                  }`}
                >
                  <span className="min-w-0">
                    <span
                      className={`block truncate ${option.selectable ? "font-medium" : ""}`}
                    >
                      {option.displayName}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--nu-text-muted)]">
                      {option.email}
                    </span>
                  </span>
                  {!option.selectable && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--nu-warning-soft,var(--nu-surface-alt))] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--nu-warning,var(--nu-text-secondary))]">
                      <UserX size={11} />
                      {PMO_COORDINATOR_STATUS_LABELS[option.status]}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {showLinkHint && project.pmoCoordinator && !isLinked && !loading && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[var(--nu-text-muted)]">
          <Link2Off size={12} className="shrink-0 mt-0.5" />
          Not linked to a PMO Portal account. Select a coordinator from the list
          to give them access to this project.
        </p>
      )}
      {showLinkHint &&
        isLinked &&
        currentOption &&
        !currentOption.selectable && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[var(--nu-warning,var(--nu-text-secondary))]">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            {currentOption.statusMessage}
          </p>
        )}

      {unavailable && (
        <Portal>
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setUnavailable(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pmo-account-unavailable-title"
              className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] w-full max-w-sm p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] flex items-center justify-center shrink-0">
                  <UserX size={18} />
                </div>
                <div className="min-w-0">
                  <h2
                    id="pmo-account-unavailable-title"
                    className="text-[15px] font-semibold text-[var(--nu-text)]"
                  >
                    PMO Account Not Available
                  </h2>
                  <p className="text-[12.5px] font-medium text-[var(--nu-text)] mt-1">
                    {unavailable.displayName}
                  </p>
                  <p className="text-[12px] text-[var(--nu-text-secondary)] break-all">
                    {unavailable.email}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[12.5px] text-[var(--nu-text-secondary)]">
                {unavailable.statusMessage}
              </p>
              <p className="mt-2 text-[11.5px] text-[var(--nu-text-muted)]">
                The PMO Coordinator was not changed. Choose an eligible
                coordinator, or ask an Administrator to fix this account.
              </p>
              <div className="flex justify-end mt-5">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setUnavailable(null)}
                >
                  OK
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};
