import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Moon, Sun, User, ChevronDown, Settings, HelpCircle, LogOut, X
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../auth/authContext";
import { NotificationBell } from "../../notifications/NotificationBell";
import { getUserProfile } from "../../services/UserService";
import type { UserProfile } from "../../types/UserProfile";
import WorkspaceHeader from "../WorkspaceHeader/WorkspaceHeader";

// Dialog Modals
import MyProfileModal from "./components/MyProfileModal";
import AccountSettingsModal from "./components/AccountSettingsModal";
import HelpDialog from "./components/HelpDialog";
import LogoutDialog from "./components/LogoutDialog";


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
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  
  const [profile] = useState<UserProfile>(getUserProfile());
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  
  // Modals active states
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  
  // Responsive layout state
  const [isMobile, setIsMobile] = useState(false);

  // Dropdown layout refs for click outside hooks
  const adminMenuRef = useRef<HTMLDivElement>(null);


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
        setIsAdminMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);


  const handleLogoutConfirm = () => {
    // Close the dialog first
    setIsLogoutOpen(false);
    // Synchronously clear auth state + localStorage, then navigate.
    // Must NOT be async – the Navbar unmounts before any await resolves,
    // which would leave the blur overlay frozen on screen.
    logout();
    navigate("/login", { replace: true });
  };



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

      <div className="flex items-center gap-3 sm:gap-6 flex-nowrap text-[var(--text-primary)]">
        
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
            <span className="hidden md:inline">Light</span>
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
            <span className="hidden md:inline">Dark</span>
          </button>
        </div>

        {/* 🔔 Notifications Dropdown Container */}
        <NotificationBell />

        {/* 👤 Administrator Dropdown Container */}
        <div ref={adminMenuRef} className="relative">
          <button
            onClick={() => {
              setIsAdminMenuOpen(!isAdminMenuOpen);
            }}
            className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition duration-150 cursor-pointer outline-none border-none bg-transparent"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center border border-blue-100 dark:border-blue-800/30 shrink-0 hover:scale-105 transition shadow-sm">
              <User size={14} className="text-white" />
            </div>
            <span className="hidden md:inline">Administrator</span>
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
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{user?.name || "Administrator"}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-350 font-semibold mt-0.5">
                    Employee ID: {user?.employeeId || "PMOV1"}
                  </p>
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

      {/* Logout overlay removed – async state never clears when Navbar unmounts */}

    </div>
  );
};

export default Navbar;