import { useState, useEffect } from "react";
import {
  CalendarDays,
  Clock3,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";
import SystemStatus from "../../../components/Dashboard/SystemStatus";
import { useTheme } from "../../../context/ThemeContext";

const WelcomeCard = () => {
  const { theme } = useTheme();
  
  const [currentDate, setCurrentDate] = useState("");
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTimeAndDate = () => {
      const now = new Date();
      
      const dateString = now.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      const timeString = now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });

      setCurrentDate(dateString);
      setCurrentTime(timeString);
    };

    updateTimeAndDate();
    const interval = setInterval(updateTimeAndDate, 1000);
    return () => clearInterval(interval);
  }, []);

  if (theme === "light") {
    return (
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-700 rounded-2xl shadow-xl px-8 py-6 text-white overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-6">
          {/* Left Section */}
          <div className="flex-1">
            <h1 
              className="text-3xl font-bold animate-fade-in-up"
              style={{ animationDelay: "100ms" }}
            >
              Welcome
            </h1>
            <h2 
              className="text-xl font-semibold mt-2 animate-fade-in-up"
              style={{ animationDelay: "200ms" }}
            >
              iFluids Engineering Project Management Dashboard
            </h2>
            <p 
              className="text-blue-100 mt-3 max-w-3xl text-sm leading-6 animate-fade-in-up"
              style={{ animationDelay: "300ms" }}
            >
              Monitor project execution, commercial performance,
              billing, profitability and operational status.
            </p>
            {/* Status */}
            <div 
              className="flex flex-wrap gap-8 mt-6 animate-fade-in-up"
              style={{ animationDelay: "400ms" }}
            >
              <SystemStatus status="Online" />
              <div className="flex items-center gap-3">
                <CalendarDays
                  size={18}
                  className="text-yellow-300"
                />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-blue-200">
                    Today
                  </p>
                  <p className="font-semibold text-sm">
                    {currentDate}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock3
                  size={18}
                  className="text-cyan-300"
                />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-blue-200">
                    Last Updated
                  </p>
                  <p className="font-semibold text-sm">
                    {currentTime}
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Right Section */}
          <div 
            className="flex justify-end animate-fade-in-up"
            style={{ animationDelay: "500ms" }}
          >
            <Link
              to="/projects/add"
              className="
                flex
                items-center
                gap-2
                bg-blue-600
                hover:bg-blue-700
                px-6
                py-3
                rounded-xl
                font-semibold
                shadow-lg
                transition
              "
            >
              <Plus size={18} />
              Add Project
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Dark Theme layout: Enterprise PMO Style
  return (
    <div className="enterprise-hero-bg relative overflow-hidden rounded-2xl border border-blue-500/25 shadow-xl hover:border-blue-500/50 transition-all duration-300">
      
      {/* Floating Glassmorphic Overlay Layer */}
      <div 
        style={{
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 12px 40px rgba(0, 0, 0, 0.18)",
        }}
        className="w-full h-full"
      >
        {/* Content Container */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-stretch gap-6 px-8 py-5 text-white">
          
          {/* Left Column */}
          <div className="flex-1 flex flex-col justify-between gap-4">
            <div>
              <h1 
                className="text-[36px] font-bold text-white leading-none animate-fade-in-up"
                style={{ animationDelay: "100ms" }}
              >
                Welcome
              </h1>
              <h2 
                className="text-[22px] font-semibold text-[#E2E8F0] mt-1.5 leading-tight animate-fade-in-up"
                style={{ animationDelay: "200ms" }}
              >
                iFluids Engineering Project Management Dashboard
              </h2>
              <p 
                className="text-[15px] text-[#CBD5E1] mt-1 max-w-3xl animate-fade-in-up"
                style={{ animationDelay: "300ms" }}
              >
                Monitor project execution, commercial performance, billing, profitability, and operational status.
              </p>
            </div>

            {/* Info Cards Row */}
            <div 
              className="flex flex-wrap lg:flex-nowrap gap-4 items-center justify-start w-full mt-4 animate-fade-in-up"
              style={{ animationDelay: "400ms" }}
            >
              
              {/* Status Info Card */}
              <div 
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  minWidth: "180px",
                  width: "fit-content",
                  padding: "14px 18px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "rgba(0, 0, 0, 0.25)",
                  backdropFilter: "blur(12px)",
                }}
                className="shrink-0"
              >
                <div 
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(59, 130, 246, 0.12)",
                    flexShrink: 0,
                  }}
                >
                  <SystemStatus status="Online" iconOnly={true} />
                </div>
                <div className="flex flex-col justify-center">
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: "1.2" }}>
                    System Status
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#FFFFFF", lineHeight: "1.2" }} className="mt-0.5">
                    Online
                  </span>
                </div>
              </div>

              {/* Date Info Card */}
              <div 
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  minWidth: "180px",
                  width: "fit-content",
                  padding: "14px 18px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "rgba(0, 0, 0, 0.25)",
                  backdropFilter: "blur(12px)",
                }}
                className="shrink-0"
              >
                <div 
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(59, 130, 246, 0.12)",
                    flexShrink: 0,
                  }}
                >
                  <CalendarDays size={18} className="text-[#60A5FA]" />
                </div>
                <div className="flex flex-col justify-center">
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: "1.2" }}>
                    Today
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#FFFFFF", lineHeight: "1.2" }} className="mt-0.5 whitespace-nowrap">
                    {currentDate}
                  </span>
                </div>
              </div>

              {/* Last Updated Card */}
              <div 
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  minWidth: "180px",
                  width: "fit-content",
                  padding: "14px 18px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "rgba(0, 0, 0, 0.25)",
                  backdropFilter: "blur(12px)",
                }}
                className="shrink-0"
              >
                <div 
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(59, 130, 246, 0.12)",
                    flexShrink: 0,
                  }}
                >
                  <Clock3 size={18} className="text-[#60A5FA]" />
                </div>
                <div className="flex flex-col justify-center">
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: "1.2" }}>
                    Last Updated
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#FFFFFF", lineHeight: "1.2" }} className="mt-0.5 whitespace-nowrap">
                    {currentTime}
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* Right Column */}
          <div className="w-full lg:w-80 flex flex-col justify-start items-end gap-6 shrink-0">
            
            {/* Add Project Button */}
            <Link
              to="/projects/add"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--nu-radius-md)] font-medium transition-colors duration-150 whitespace-nowrap text-[13px] px-3.5 py-2 bg-[var(--nu-accent)] text-white hover:bg-[var(--nu-accent-strong)] border border-transparent shadow-[var(--nu-shadow-lg)] animate-fade-in-up"
              style={{ animationDelay: "500ms" }}
            >
              <Plus size={16} />
              <span>Add Project</span>
            </Link>

          </div>

        </div>
      </div>
      
    </div>
  );
};

export default WelcomeCard;