import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();

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
    >
      <h2 style={{ color: "var(--text-primary)", fontWeight: 600 }}>Dashboard</h2>

      <div style={{ display: "flex", alignItems: "center", gap: "24px", color: "var(--text-primary)" }}>
        {/* Compact Theme Switch */}
        <button
          onClick={toggleTheme}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            borderRadius: "9999px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-card)",
            cursor: "pointer",
            outline: "none",
            boxShadow: "var(--header-shadow)",
          }}
          className="theme-toggle-btn"
          title="Toggle Theme"
        >
          <Sun
            size={14}
            className={`${
              theme === "light" ? "text-amber-500 fill-amber-500" : "text-slate-400"
            }`}
          />
          <span style={{ color: "var(--border-color)", fontSize: "12px" }}>|</span>
          <Moon
            size={14}
            className={`${
              theme === "dark" ? "text-blue-400 fill-blue-400/20" : "text-slate-400"
            }`}
          />
        </button>

        <span>🔔 Notifications</span>
        <span>👤 Administrator</span>
      </div>
    </div>
  );
};

export default Navbar;