import { useState, useEffect, useRef } from "react";
import { 
  Moon, Sun, Bell, User, ChevronDown, Settings, HelpCircle, LogOut,
  Briefcase, FileText, TrendingUp, CreditCard, Users, Info, X
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { 
  getNotifications, markAllAsRead, markAsRead
} from "../../services/NotificationService";
import type { AppNotification } from "../../types/AppNotification";
import { getUserProfile } from "../../services/UserService";
import type { UserProfile } from "../../types/UserProfile";
import WorkspaceHeader from "../WorkspaceHeader/WorkspaceHeader";

// Dialog Modals
import MyProfileModal from "./components/MyProfileModal";
import AccountSettingsModal from "./components/AccountSettingsModal";
import HelpDialog from "./components/HelpDialog";
import LogoutDialog from "./components/LogoutDialog";

const getNotificationIcon = (type: string) => {
  const iconClass = "text-blue-600 dark:text-blue-400";
  switch (type) {
    case "project":
      return <Briefcase className={iconClass} size={16} />;
    case "invoice":
      return <FileText className={iconClass} size={16} />;
    case "expense":
      return <TrendingUp className={iconClass} size={16} />;
    case "payment":
      return <CreditCard className={iconClass} size={16} />;
    case "team":
      return <Users className={iconClass} size={16} />;
    default:
      return <Info className={iconClass} size={16} />;
  }
};

const getRowClass = (isActive: boolean) => {
  if (isActive) {
    return "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-[#FFFFFF] dark:text-[#FFFFFF] cursor-pointer transition duration-200 border-none text-left shadow-sm";
  }
  return "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer transition duration-200 border-none bg-transparent text-left group";
};

const getIconClass = (isActive: boolean) => {
  if (isActive) {
    return "text-[#FFFFFF] shrink-0";
  }
  return "text-slate-500 dark:text-slate-300 group-hover:text-blue-400 transition duration-200 shrink-0";
};

const getLogoutRowClass = (isActive: boolean) => {
  if (isActive) {
    return "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-red-600 text-[#FFFFFF] cursor-pointer transition duration-200 border-none text-left shadow-sm";
  }
  return "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-red-650 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer transition duration-200 border-none bg-transparent text-left group";
};

const getLogoutIconClass = (isActive: boolean) => {
  if (isActive) {
    return "text-[#FFFFFF] shrink-0";
  }
  return "text-red-500 dark:text-red-400 transition duration-200 shrink-0";
};

const Navbar = () => {
  const { theme, setTheme } = useTheme();
  
  // Toggles and data hooks
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [profile] = useState<UserProfile>(getUserProfile());
  
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  
  // Modals active states
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  
  // Responsive layout state
  const [isMobile, setIsMobile] = useState(false);

  // Dropdown layout refs for click outside hooks
  const notificationsRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  // Load notifications from local storage on mount
  useEffect(() => {
    setNotifications(getNotifications());
  }, []);

  // Monitor screen size for mobile responsive drawer adjustments
  useEffect(() => {
    const checkSize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  // Click Outside hook implementation
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        notificationsRef.current && 
        !notificationsRef.current.contains(e.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
      if (
        adminMenuRef.current && 
        !adminMenuRef.current.contains(e.target as Node)
      ) {
        setIsAdminMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Keypress ESC listener to exit active menus/panels
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsNotificationsOpen(false);
        setIsAdminMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMarkAllAsRead = () => {
    const updated = markAllAsRead();
    setNotifications(updated);
  };

  const handleNotificationClick = (id: string) => {
    const updated = markAsRead(id);
    setNotifications(updated);
  };

  const handleLogoutConfirm = () => {
    setIsLogoutOpen(false);
    alert("Simulated logout successful! Persisted local data remains active.");
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div
      style={{
        height: "70px",
        backgroundColor: "var(--bg-header)",
        borderBottom: "1px solid var(--border-color)",
        boxShadow: "var(--header-shadow)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 30px",
      }}
      className="relative z-45"
    >
      <WorkspaceHeader />

      <div style={{ display: "flex", alignItems: "center", gap: "24px", color: "var(--text-primary)" }}>
        
        {/* Segmented Theme Switcher */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--bg-main)",
            padding: "2px",
            borderRadius: "9999px",
            border: "1px solid var(--border-color)",
            boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.05)",
          }}
        >
          {/* Light Button */}
          <button
            onClick={() => theme === "dark" && setTheme("light")}
            disabled={theme === "light"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: theme === "light" ? 600 : 500,
              backgroundColor: theme === "light" ? "var(--bg-card)" : "transparent",
              color: theme === "light" ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: theme === "light" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
              cursor: theme === "light" ? "default" : "pointer",
              border: "none",
              outline: "none",
              transition: "all 0.2s ease-in-out",
            }}
            title="Switch to Light Theme"
          >
            <Sun
              size={14}
              className={`${
                theme === "light" ? "text-amber-500 fill-amber-500" : "text-slate-400"
              }`}
            />
            <span>Light</span>
          </button>

          {/* Dark Button */}
          <button
            onClick={() => theme === "light" && setTheme("dark")}
            disabled={theme === "dark"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: theme === "dark" ? 600 : 500,
              backgroundColor: theme === "dark" ? "var(--bg-card)" : "transparent",
              color: theme === "dark" ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: theme === "dark" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
              cursor: theme === "dark" ? "default" : "pointer",
              border: "none",
              outline: "none",
              transition: "all 0.2s ease-in-out",
            }}
            title="Switch to Dark Theme"
          >
            <Moon
              size={14}
              className={`${
                theme === "dark" ? "text-blue-400 fill-blue-400/20" : "text-slate-400"
              }`}
            />
            <span>Dark</span>
          </button>
        </div>

        {/* 🔔 Notifications Dropdown Container */}
        <div ref={notificationsRef} className="relative">
          <button
            onClick={() => {
              setIsNotificationsOpen(!isNotificationsOpen);
              setIsAdminMenuOpen(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition duration-150 cursor-pointer outline-none border-none bg-transparent"
          >
            <Bell size={16} className="text-slate-500 dark:text-slate-400" />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-blue-600 dark:bg-blue-500 text-white rounded-full text-[10px] w-4.5 h-4.5 flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications List Panel */}
          {isNotificationsOpen && (
            <div className={`
              ${isMobile 
                ? "fixed inset-x-0 bottom-0 z-50 w-full bg-white dark:bg-[#1E293B] border-t border-slate-200 dark:border-slate-700 rounded-t-2xl shadow-2xl max-h-[75vh] flex flex-col animate-fade-in-up"
                : "absolute right-0 mt-2 z-50 w-[360px] bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl flex flex-col"
              }
            `}>
              {/* Header row */}
              <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline border-none bg-transparent cursor-pointer"
                  >
                    Mark All as Read
                  </button>
                )}
                {isMobile && (
                  <button
                    onClick={() => setIsNotificationsOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 border-none bg-transparent"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Notification list scroll */}
              <div className="flex-1 overflow-y-auto max-h-[360px] p-2 space-y-1.5 custom-scrollbar-timeline bg-transparent">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-transparent">
                    <Bell size={28} className="text-slate-400 dark:text-slate-500 mb-2 animate-bounce" />
                    <p className="text-sm font-bold text-slate-800">No Notifications</p>
                    <p className="text-xs text-slate-500 mt-0.5">You're all caught up.</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif.id)}
                      className={`p-4 flex gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition duration-200 relative items-start bg-white dark:bg-transparent rounded-lg border-l-2 ${
                        !notif.isRead 
                          ? "border-blue-600 dark:border-blue-500" 
                          : "border-transparent"
                      }`}
                    >
                      {/* Left icon wrapper */}
                      <div className="mt-0.5 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center border border-slate-200 dark:border-slate-600 shrink-0">
                        {getNotificationIcon(notif.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-4">
                        <p className={`text-sm text-slate-800 truncate ${
                          !notif.isRead ? "font-bold" : "font-semibold"
                        }`}>
                          {notif.title}
                        </p>
                        <p className="text-[13px] leading-normal text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed break-words">
                          {notif.description}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wide">
                          {notif.time}
                        </p>
                      </div>

                      {/* Unread dot */}
                      {!notif.isRead && (
                        <span className="absolute right-4 top-5 w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-500 shadow-sm shadow-blue-500/30 shrink-0" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 👤 Administrator Dropdown Container */}
        <div ref={adminMenuRef} className="relative">
          <button
            onClick={() => {
              setIsAdminMenuOpen(!isAdminMenuOpen);
              setIsNotificationsOpen(false);
            }}
            className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition duration-150 cursor-pointer outline-none border-none bg-transparent"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center border border-blue-100 dark:border-blue-800/30 shrink-0 hover:scale-105 transition shadow-sm">
              <User size={14} className="text-white" />
            </div>
            <span>Administrator</span>
            <ChevronDown size={14} className="text-slate-400 shrink-0" />
          </button>

          {/* Admin Menu List Panel */}
          {isAdminMenuOpen && (
            <div className={`
              ${isMobile 
                ? "fixed inset-x-0 bottom-0 z-50 w-full bg-white dark:bg-[#1E293B] border-t border-slate-200 dark:border-slate-700 rounded-t-2xl shadow-2xl max-h-[75vh] flex flex-col animate-fade-in-up"
                : "absolute right-0 mt-2 z-50 w-[240px] bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl flex flex-col p-2"
              }
            `}>
              {/* Header (Only on mobile header row is explicitly closed) */}
              <div className="flex justify-between items-center px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 mb-1">
                <div>
                  <p className="text-xs font-bold text-slate-800">Administrator</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-300 uppercase tracking-wide font-semibold mt-0.5">System Administrator</p>
                </div>
                {isMobile && (
                  <button
                    onClick={() => setIsAdminMenuOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 border-none bg-transparent"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Options */}
              <div className="space-y-0.5">
                <button
                  onClick={() => {
                    setIsProfileOpen(true);
                    setIsAdminMenuOpen(false);
                  }}
                  className={getRowClass(isProfileOpen)}
                >
                  <User className={getIconClass(isProfileOpen)} size={15} />
                  <span>My Profile</span>
                </button>

                <button
                  onClick={() => {
                    setIsSettingsOpen(true);
                    setIsAdminMenuOpen(false);
                  }}
                  className={getRowClass(isSettingsOpen)}
                >
                  <Settings className={getIconClass(isSettingsOpen)} size={15} />
                  <span>Account Settings</span>
                </button>

                <button
                  onClick={() => {
                    setIsSettingsOpen(true); // Open settings (Appearance tab is inside it)
                    setIsAdminMenuOpen(false);
                  }}
                  className={getRowClass(false)}
                >
                  <Sun className={getIconClass(false)} size={15} />
                  <span>Appearance</span>
                </button>

                <button
                  onClick={() => {
                    setIsHelpOpen(true);
                    setIsAdminMenuOpen(false);
                  }}
                  className={getRowClass(isHelpOpen)}
                >
                  <HelpCircle className={getIconClass(isHelpOpen)} size={15} />
                  <span>Help</span>
                </button>

                <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />

                <button
                  onClick={() => {
                    setIsLogoutOpen(true);
                    setIsAdminMenuOpen(false);
                  }}
                  className={getLogoutRowClass(isLogoutOpen)}
                >
                  <LogOut className={getLogoutIconClass(isLogoutOpen)} size={15} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Dialog Modals Overlay Mount */}
      <MyProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={profile}
      />

      <AccountSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <HelpDialog
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      <LogoutDialog
        isOpen={isLogoutOpen}
        onClose={() => setIsLogoutOpen(false)}
        onConfirm={handleLogoutConfirm}
      />

    </div>
  );
};

export default Navbar;