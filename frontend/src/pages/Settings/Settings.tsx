import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Shield } from "lucide-react";
import { UserManagementSection } from "./components/userManagement/UserManagementSection";
import { SecurityAuditSection } from "./components/audit/SecurityAuditSection";
import "./settings-theme.css";

type SettingsTab = "users" | "audit";

// "system" (System Preferences) and "notifications" (Notification Alert
// Rules) were removed — both were unimplemented placeholder cards with no
// real functionality behind them. Any link still pointing at one of these
// legacy tab values is redirected to the audit tab rather than left to
// render nothing.
const LEGACY_REMOVED_TABS = new Set(["system", "notifications"]);
const VALID_TABS: SettingsTab[] = ["users", "audit"];

const Settings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    (VALID_TABS as string[]).includes(tabParam ?? "") ? (tabParam as SettingsTab) : "users"
  );

  useEffect(() => {
    if (!tabParam) return;
    if (LEGACY_REMOVED_TABS.has(tabParam)) {
      setActiveTab("audit");
      setSearchParams({ tab: "audit" }, { replace: true });
      return;
    }
    if ((VALID_TABS as string[]).includes(tabParam)) {
      setActiveTab(tabParam as SettingsTab);
    }
  }, [tabParam]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="settings-shell -m-6 p-4 space-y-3.5 nu-fade-in">
      {/* Settings Navigation Tabs */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-1.5 shadow-[var(--nu-shadow-sm)] flex items-center gap-1.5 overflow-x-auto nu-scrollbar">
        <button
          type="button"
          onClick={() => handleTabChange("users")}
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
          onClick={() => handleTabChange("audit")}
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
      {activeTab === "audit" && <SecurityAuditSection />}
    </div>
  );
};

export default Settings;
