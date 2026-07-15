import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

const Navbar = () => {
  const { theme, setTheme } = useTheme();

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

        <span>🔔 Notifications</span>
        <span>👤 Administrator</span>
      </div>
    </div>
  );
};

export default Navbar;