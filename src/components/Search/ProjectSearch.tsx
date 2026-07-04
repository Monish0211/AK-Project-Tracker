import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Search } from "lucide-react";
import type { Project } from "../../types/Project";

interface ProjectSearchProps {
  projects: Project[];
  value: string;
  disabled?: boolean;
  onSelect: (projectId: string) => void;
}

const ProjectSearch = ({
  projects,
  value,
  disabled = false,
  onSelect,
}: ProjectSearchProps) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === value),
    [projects, value]
  );

  const selectedLabel = selectedProject
    ? `${selectedProject.prNo} — ${selectedProject.projectTitle}`
    : "";

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) {
      return projects;
    }

    return projects.filter(
      (project) =>
        project.prNo?.toLowerCase().includes(term) ||
        project.client?.toLowerCase().includes(term) ||
        project.projectTitle?.toLowerCase().includes(term)
    );
  }, [projects, query]);

  // Reset the highlighted row whenever the search term or open state changes.
  // Adjusted during render (not in a useEffect) to avoid the extra cascading
  // render pass that setState-in-effect would trigger for this "reset on
  // dependency change" case.
  const resetKey = `${query}|${isOpen}`;
  const [syncedResetKey, setSyncedResetKey] = useState(resetKey);

  if (resetKey !== syncedResetKey) {
    setSyncedResetKey(resetKey);
    setHighlightedIndex(0);
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (project: Project) => {
    onSelect(project.id);
    setIsOpen(false);
  };

  const handleFocus = () => {
    if (disabled) {
      return;
    }

    setQuery("");
    setIsOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        setIsOpen(true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;

      case "ArrowUp":
        event.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;

      case "Enter":
        event.preventDefault();
        if (results[highlightedIndex]) {
          handleSelect(results[highlightedIndex]);
        }
        break;

      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        break;

      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          value={isOpen ? query : selectedLabel}
          disabled={disabled}
          onFocus={handleFocus}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by PR No, Client or Project Title..."
          className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        />
      </div>

      {isOpen && !disabled && (
        <div
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-md"
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">
              No matching projects found
            </p>
          ) : (
            results.map((project, index) => (
              <button
                key={project.id}
                type="button"
                role="option"
                aria-selected={project.id === value}
                onClick={() => handleSelect(project)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-50 px-4 py-2.5 text-left last:border-b-0 transition-colors duration-100 ${
                  index === highlightedIndex
                    ? "bg-blue-50"
                    : "hover:bg-slate-50"
                }`}
              >
                <span className="text-sm font-semibold text-slate-800">
                  {project.prNo}
                </span>
                <span className="text-xs text-slate-500">
                  {project.client}
                </span>
                <span className="text-xs text-slate-400">
                  {project.projectTitle}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectSearch;
