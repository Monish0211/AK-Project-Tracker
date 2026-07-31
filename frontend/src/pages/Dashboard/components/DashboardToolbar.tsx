import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { getProjects } from "../../../services/projectService";
import { Badge } from "../../../components/ui/Badge";
import { statusTone } from "../../../components/ui/statusTone";

interface Props {
  onRefresh: () => void;
}

type MenuKey = "search" | null;

const SEARCHABLE_FIELDS = [
  "prNo",
  "client",
  "projectTitle",
  "department",
  "primaryProjectManager",
  "projectEngineer",
  "projectCoordinator",
  "pmoCoordinator",
] as const;

const DashboardToolbar = ({ onRefresh }: Props) => {
  const navigate = useNavigate();

  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return getProjects()
      .filter((project) =>
        SEARCHABLE_FIELDS.some((field) => (project[field] || "").toString().toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [query]);

  const handleRefreshClick = () => {
    setIsRefreshing(true);
    onRefresh();
    window.setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleSelectResult = (id: string) => {
    setQuery("");
    setOpenMenu(null);
    navigate(`/projects/view/${id}`);
  };

  return (
    <header
      className="h-14 flex items-center justify-between gap-3 px-4 border-b shrink-0"
      style={{ background: "var(--nu-surface)", borderColor: "var(--nu-border)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-[15px] font-semibold text-[var(--nu-text)] truncate">Dashboard</h1>
        <span className="text-[11px] text-[var(--nu-text-muted)] hidden lg:inline">iFluids Engineering · PMO Portal</span>
      </div>

      <div className="flex items-center gap-2.5 shrink-0" ref={menuRef}>
        {/* Search */}
        <div className="relative">
          <div className="flex items-center gap-2 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-2.5 py-1.5 w-32 sm:w-48 md:w-60 lg:w-72 transition-all duration-300">
            <Search size={13} className="text-[var(--nu-text-muted)] shrink-0" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpenMenu("search");
              }}
              onFocus={() => setOpenMenu("search")}
              placeholder="Search PR No, client, title, manager..."
              className="bg-transparent outline-none text-[12px] w-full placeholder:text-[var(--nu-text-muted)] text-[var(--nu-text)]"
            />
          </div>

          {openMenu === "search" && query.trim() !== "" && (
            <div className="absolute left-0 mt-2 w-[380px] bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] z-50 nu-fade-in overflow-hidden">
              {searchResults.length === 0 ? (
                <p className="px-3.5 py-4 text-[12px] text-[var(--nu-text-muted)] text-center">No matching projects found.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto nu-scrollbar">
                  {searchResults.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleSelectResult(project.id)}
                      className="w-full text-left px-3.5 py-2.5 border-b border-[var(--nu-border)] last:border-none hover:bg-[var(--nu-surface-alt)] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-[var(--nu-text)] truncate">{project.prNo}</span>
                        <Badge tone={statusTone(project.projectStatus)} dot>
                          {project.projectStatus || "—"}
                        </Badge>
                      </div>
                      <p className="text-[11.5px] text-[var(--nu-text-secondary)] truncate mt-0.5">{project.projectTitle}</p>
                      <p className="text-[10.5px] text-[var(--nu-text-muted)] truncate">{project.client}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Link
          to="/projects/add"
          className="flex items-center gap-1.5 bg-[var(--nu-accent)] hover:bg-[var(--nu-accent-strong)] text-white text-[12px] font-semibold px-3 py-1.5 rounded-[var(--nu-radius-md)] transition-colors"
        >
          <Plus size={13} />
          <span className="hidden sm:inline">Add Project</span>
        </Link>

        <button
          onClick={handleRefreshClick}
          title="Refresh Dashboard data"
          className="w-8 h-8 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] flex items-center justify-center text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
        >
          <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>
    </header>
  );
};

export default DashboardToolbar;
