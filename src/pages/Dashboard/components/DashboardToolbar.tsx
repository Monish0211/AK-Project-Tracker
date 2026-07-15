import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  HelpCircle,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useTheme } from "../../../context/ThemeContext";
import { getNotifications, markAllAsRead, markAsRead } from "../../../services/NotificationService";
import type { AppNotification } from "../../../types/AppNotification";
import { getUserProfile } from "../../../services/UserService";
import { getProjects } from "../../../services/projectService";
import { Badge } from "../../../components/ui/Badge";
import { statusTone } from "../../../components/ui/statusTone";

// Reused as-is from the existing Navbar Administrator dropdown — not redesigned or duplicated in logic.
import MyProfileModal from "../../../components/Navbar/components/MyProfileModal";
import AccountSettingsModal from "../../../components/Navbar/components/AccountSettingsModal";
import HelpDialog from "../../../components/Navbar/components/HelpDialog";
import LogoutDialog from "../../../components/Navbar/components/LogoutDialog";

interface Props {
  onRefresh: () => void;
}

type MenuKey = "search" | "notifications" | "admin" | null;

const SEARCHABLE_FIELDS = [
  "prNo",
  "client",
  "projectTitle",
  "department",
  "primaryProjectManager",
  "projectEngineer",
  "projectCoordinator",
] as const;

const DashboardToolbar = ({ onRefresh }: Props) => {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [notifications, setNotifications] = useState<AppNotification[]>(() => getNotifications());
  const [profile] = useState(() => getUserProfile());

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

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

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const initials = profile.fullName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleMarkAllAsRead = () => setNotifications(markAllAsRead());
  const handleNotificationClick = (id: string) => setNotifications(markAsRead(id));

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

  const handleLogoutConfirm = () => {
    setIsLogoutOpen(false);
    alert("Simulated logout successful! Persisted local data remains active.");
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
        <div className="relative hidden md:block">
          <div className="flex items-center gap-2 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-2.5 py-1.5 w-72">
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

        <div className="w-px h-6 bg-[var(--nu-border)] mx-0.5 hidden sm:block" />

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="w-8 h-8 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] flex items-center justify-center text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu((prev) => (prev === "notifications" ? null : "notifications"))}
            aria-label="Notifications"
            className="relative w-8 h-8 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] flex items-center justify-center text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
          >
            <Bell size={14} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[var(--nu-danger)] text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {openMenu === "notifications" && (
            <div className="absolute right-0 mt-2 w-72 bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] z-50 nu-fade-in overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--nu-border)]">
                <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">Notifications</p>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllAsRead} className="text-[11px] font-semibold text-[var(--nu-accent)] hover:underline">
                    Mark All as Read
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto nu-scrollbar">
                {notifications.length === 0 ? (
                  <p className="px-3.5 py-4 text-[12px] text-[var(--nu-text-muted)] text-center">No notifications.</p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n.id)}
                      className={`w-full text-left px-3.5 py-2.5 border-b border-[var(--nu-border)] last:border-none hover:bg-[var(--nu-surface-alt)] border-l-2 ${
                        !n.isRead ? "border-l-[var(--nu-accent)]" : "border-l-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-[12px] text-[var(--nu-text)] truncate ${!n.isRead ? "font-bold" : "font-semibold"}`}>{n.title}</p>
                        {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-[var(--nu-accent)] shrink-0" />}
                      </div>
                      <p className="text-[11px] text-[var(--nu-text-secondary)] mt-0.5 leading-snug">{n.description}</p>
                      <p className="text-[10px] text-[var(--nu-text-muted)] mt-1">{n.time}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Administrator */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu((prev) => (prev === "admin" ? null : "admin"))}
            className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] hover:bg-[var(--nu-surface-alt)] transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-[var(--nu-accent)] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
              {initials || <User size={12} />}
            </div>
            <span className="text-[12px] font-medium text-[var(--nu-text-secondary)] hidden lg:inline">{profile.fullName}</span>
            <ChevronDown size={12} className="text-[var(--nu-text-muted)]" />
          </button>

          {openMenu === "admin" && (
            <div className="absolute right-0 mt-2 w-56 bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] z-50 nu-fade-in overflow-hidden p-1.5">
              <div className="px-2.5 py-2 border-b border-[var(--nu-border)] mb-1">
                <p className="text-[12px] font-semibold text-[var(--nu-text)]">{profile.fullName}</p>
                <p className="text-[10.5px] text-[var(--nu-text-muted)]">{profile.role}</p>
              </div>

              <button
                onClick={() => {
                  setIsProfileOpen(true);
                  setOpenMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--nu-radius-md)] text-[12px] font-medium text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
              >
                <User size={14} />
                My Profile
              </button>

              <button
                onClick={() => {
                  setIsSettingsOpen(true);
                  setOpenMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--nu-radius-md)] text-[12px] font-medium text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
              >
                <Settings size={14} />
                Account Settings
              </button>

              <button
                onClick={() => {
                  setIsSettingsOpen(true);
                  setOpenMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--nu-radius-md)] text-[12px] font-medium text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
              >
                <Sun size={14} />
                Appearance
              </button>

              <button
                onClick={() => {
                  setIsHelpOpen(true);
                  setOpenMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--nu-radius-md)] text-[12px] font-medium text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
              >
                <HelpCircle size={14} />
                Help
              </button>

              <div className="h-px bg-[var(--nu-border)] my-1" />

              <button
                onClick={() => {
                  setIsLogoutOpen(true);
                  setOpenMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--nu-radius-md)] text-[12px] font-medium text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)] transition-colors"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <MyProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} profile={profile} />
      <AccountSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <LogoutDialog isOpen={isLogoutOpen} onClose={() => setIsLogoutOpen(false)} onConfirm={handleLogoutConfirm} />
    </header>
  );
};

export default DashboardToolbar;
