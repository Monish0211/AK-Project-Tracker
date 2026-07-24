import { useState } from "react";
import { Users, Sliders, Bell, Shield } from "lucide-react";
import { UserManagementSection } from "./components/userManagement/UserManagementSection";
import "./settings-theme.css";

type SettingsTab = "users" | "system" | "notifications" | "audit";

const Settings = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("users");

  return (
    <div className="settings-shell -m-6 p-4 space-y-3.5 nu-fade-in">
      {/* Settings Navigation Tabs */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-1.5 shadow-[var(--nu-shadow-sm)] flex items-center gap-1.5 overflow-x-auto nu-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] text-[12.5px] font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
            activeTab === "users"
              ? "bg-[var(--nu-accent)] text-white shadow-[var(--nu-shadow-sm)]"
              : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
          }`}
        >
          <Users size={15} />
          User Management
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("system")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] text-[12.5px] font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
            activeTab === "system"
              ? "bg-[var(--nu-accent)] text-white shadow-[var(--nu-shadow-sm)]"
              : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
          }`}
        >
          <Sliders size={15} />
          System Preferences
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("notifications")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] text-[12.5px] font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
            activeTab === "notifications"
              ? "bg-[var(--nu-accent)] text-white shadow-[var(--nu-shadow-sm)]"
              : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
          }`}
        >
          <Bell size={15} />
          Notification Alert Rules
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] text-[12.5px] font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
            activeTab === "audit"
              ? "bg-[var(--nu-accent)] text-white shadow-[var(--nu-shadow-sm)]"
              : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
          }`}
        >
          <Shield size={15} />
          Security & Audit Logs
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "users" && <UserManagementSection />}

      {activeTab === "system" && (
        <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-8 text-center space-y-2">
          <Sliders size={32} className="mx-auto text-[var(--nu-text-muted)]" />
          <h3 className="text-base font-bold text-[var(--nu-text)]">System Preferences</h3>
          <p className="text-[12.5px] text-[var(--nu-text-muted)] max-w-md mx-auto">
            Configure global currency formatting, fiscal year start dates, default project templates, and regional localization.
          </p>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-8 text-center space-y-2">
          <Bell size={32} className="mx-auto text-[var(--nu-text-muted)]" />
          <h3 className="text-base font-bold text-[var(--nu-text)]">Notification Alert Rules</h3>
          <p className="text-[12.5px] text-[var(--nu-text-muted)] max-w-md mx-auto">
            Configure automated email digest rules, payment milestone reminders, invoice collection alerts, and project status notifications.
          </p>
        </div>
      )}

      {activeTab === "audit" && (
        <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-8 text-center space-y-2">
          <Shield size={32} className="mx-auto text-[var(--nu-text-muted)]" />
          <h3 className="text-base font-bold text-[var(--nu-text)]">Security & Audit Logs</h3>
          <p className="text-[12.5px] text-[var(--nu-text-muted)] max-w-md mx-auto">
            View system login history, data modification audit trails, permission change records, and security compliance logs.
          </p>
        </div>
      )}
    </div>
  );
};

export default Settings;