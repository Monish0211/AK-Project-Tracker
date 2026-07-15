import { useState } from "react";
import { X, Settings, Bell, Shield, Sun, Moon, Globe } from "lucide-react";
import { useTheme } from "../../../context/ThemeContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type TabKey = "general" | "notifications" | "security" | "theme" | "language";

export const AccountSettingsModal = ({ isOpen, onClose }: Props) => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(false);
  const [language, setLanguage] = useState("en");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-200 scale-100 flex flex-col h-[520px] mx-4">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="text-blue-600 dark:text-blue-400" size={20} />
            <h3 className="text-lg font-bold text-slate-800">
              Account Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-650 dark:hover:text-slate-300 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area (Split Sidebar / Detail Pane) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-[180px] sm:w-[200px] border-r border-gray-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 overflow-y-auto px-3 py-4 space-y-1">
            <button
              onClick={() => setActiveTab("general")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "general"
                  ? "bg-blue-600 text-[#FFFFFF] shadow-sm"
                  : "text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Settings size={15} />
              <span>General</span>
            </button>

            <button
              onClick={() => setActiveTab("notifications")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "notifications"
                  ? "bg-blue-600 text-[#FFFFFF] shadow-sm"
                  : "text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Bell size={15} />
              <span>Notifications</span>
            </button>

            <button
              onClick={() => setActiveTab("security")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "security"
                  ? "bg-blue-600 text-[#FFFFFF] shadow-sm"
                  : "text-slate-650 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Shield size={15} />
              <span>Security</span>
            </button>

            <button
              onClick={() => setActiveTab("theme")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "theme"
                  ? "bg-blue-600 text-[#FFFFFF] shadow-sm"
                  : "text-slate-650 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Sun size={15} />
              <span>Appearance</span>
            </button>

            <button
              onClick={() => setActiveTab("language")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "language"
                  ? "bg-blue-600 text-[#FFFFFF] shadow-sm"
                  : "text-slate-650 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Globe size={15} />
              <span>Language</span>
            </button>
          </div>

          {/* Settings Pane */}
          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#1E293B]">
            {activeTab === "general" && (
              <div className="space-y-4">
                <h4 className="text-base font-bold text-slate-800 mb-2">General Settings</h4>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">PMO Portal Version</label>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">v2.1.0-prod</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Organizational Unit</label>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">iFluids Chennai HQ</p>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-5">
                <h4 className="text-base font-bold text-slate-800 mb-2">Notification Preferences</h4>
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800/60">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Email Alerts</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Receive digests for newly approved timesheets</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={emailAlerts}
                    onChange={(e) => setEmailAlerts(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Desktop Push Notifications</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Receive immediate invoice approval popups</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={pushAlerts}
                    onChange={(e) => setPushAlerts(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-4">
                <h4 className="text-base font-bold text-slate-800 mb-2">Security Preferences</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Current Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      disabled
                      className="w-full mt-1.5 px-3 py-2 border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-xl text-sm outline-none cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">New Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      disabled
                      className="w-full mt-1.5 px-3 py-2 border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-xl text-sm outline-none cursor-not-allowed"
                    />
                  </div>
                  <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">Security configs are managed via Active Directory.</p>
                </div>
              </div>
            )}

            {activeTab === "theme" && (
              <div className="space-y-4">
                <h4 className="text-base font-bold text-slate-800 mb-2">Theme Preferences</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                  Select a theme style for the portal display:
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setTheme("light")}
                    className={`flex items-center gap-2.5 justify-center py-3.5 border rounded-2xl transition font-semibold text-sm ${
                      theme === "light"
                        ? "border-blue-600 bg-blue-50/20 text-blue-600 dark:text-blue-400"
                        : "border-gray-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800"
                    }`}
                  >
                    <Sun size={16} />
                    <span>Light Mode</span>
                  </button>

                  <button
                    onClick={() => setTheme("dark")}
                    className={`flex items-center gap-2.5 justify-center py-3.5 border rounded-2xl transition font-semibold text-sm ${
                      theme === "dark"
                        ? "border-blue-600 bg-blue-50/20 text-blue-600 dark:text-blue-400"
                        : "border-gray-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-805"
                    }`}
                  >
                    <Moon size={16} />
                    <span>Dark Mode</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === "language" && (
              <div className="space-y-4">
                <h4 className="text-base font-bold text-slate-800 mb-2">Language Preferences</h4>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full mt-1.5 px-3 py-2 border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm outline-none font-semibold text-slate-800"
                  >
                    <option value="en">English (India)</option>
                    <option value="en-us">English (US)</option>
                    <option value="ae">Arabic (UAE)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-slate-700 gap-3 bg-white dark:bg-[#1E293B] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 dark:border-slate-750 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
export default AccountSettingsModal;
