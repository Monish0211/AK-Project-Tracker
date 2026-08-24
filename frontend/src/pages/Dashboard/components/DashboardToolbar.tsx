import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { queryProjectsFromApi } from "../../../services/projectService";
import { refreshTimesheetImportsFromBackend } from "../../../services/timesheetService";
import { ApiError } from "../../../services/apiClient";
import { Badge } from "../../../components/ui/Badge";
import { statusTone } from "../../../components/ui/statusTone";
import { usePmoToast } from "../../../components/ui/usePmoToast";

interface Props {
  onRefresh: () => void;
}

type MenuKey = "search" | null;

interface SearchHit {
  id: string;
  prNo: string;
  projectTitle: string;
  client: string;
  projectStatus: string;
}

const DashboardToolbar = ({ onRefresh }: Props) => {
  const navigate = useNavigate();
  const { showToast } = usePmoToast();

  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "ready" | "forbidden">("idle");

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

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setSearchStatus("idle");
      return;
    }

    let cancelled = false;
    setSearchStatus("loading");
    const timer = window.setTimeout(() => {
      queryProjectsFromApi({ search: q, page: 1, pageSize: 6 })
        .then((result) => {
          if (cancelled) return;
          setSearchResults(
            result.items.map((project) => ({
              id: project.id,
              prNo: project.prNo,
              projectTitle: project.projectTitle,
              client: project.client,
              projectStatus: project.projectStatus,
            }))
          );
          setSearchStatus("ready");
        })
        .catch((err) => {
          if (cancelled) return;
          setSearchResults([]);
          setSearchStatus(err instanceof ApiError && err.status === 403 ? "forbidden" : "ready");
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  // Timesheet cache refresh is Team Assigned / Timesheets-page support, not
  // Dashboard KPIs. Portfolio figures refresh via onRefresh → GET /dashboard/summary.
  const handleRefreshClick = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshTimesheetImportsFromBackend();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 403)) {
        showToast({
          type: "error",
          message: err instanceof ApiError ? err.message : "Failed to refresh timesheet data. Please try again.",
        });
      }
    } finally {
      onRefresh();
      setIsRefreshing(false);
    }
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
              {searchStatus === "loading" ? (
                <p className="px-3.5 py-4 text-[12px] text-[var(--nu-text-muted)] text-center">Searching…</p>
              ) : searchStatus === "forbidden" ? (
                <p className="px-3.5 py-4 text-[12px] text-[var(--nu-text-muted)] text-center">
                  Project search needs Projects module access. Dashboard totals still come from the Dashboard API.
                </p>
              ) : searchResults.length === 0 ? (
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
          title="Refresh Dashboard portfolio from the server"
          className="w-8 h-8 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] flex items-center justify-center text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
        >
          <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>
    </header>
  );
};

export default DashboardToolbar;
