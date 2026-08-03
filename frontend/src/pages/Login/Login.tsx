import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye, EyeOff, Lock, User, Sun, Moon, ShieldAlert, Check,
  FolderGit2, TrendingUp, Users, Award, ShieldCheck, ChevronRight,
  FileText, BadgeIndianRupee, Calendar, FileSpreadsheet, Cpu, Layers
} from "lucide-react";
import { useAuth } from "../../auth/authContext";
import { useTheme } from "../../context/ThemeContext";
import SplashScreen from "../../components/Splash/SplashScreen";
import { Logo } from "../../components/ui/Logo";

export default function Login() {
  const { user, login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // If already authenticated, redirect immediately to Dashboard
  useEffect(() => {
    if (user && user.isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  // Input Refs
  const employeeIdRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Form States
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Focus States
  const [isIdFocused, setIsIdFocused] = useState(false);
  const [isPassFocused, setIsPassFocused] = useState(false);

  // Validation / Error States
  const [errors, setErrors] = useState<{ employeeId?: string; password?: string }>({});
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authStatusText, setAuthStatusText] = useState("Sign In to Portal");
  const [shakeCard, setShakeCard] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Splash & Transition States
  const [showSplash, setShowSplash] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Parallax Coordinate States
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);

    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2800);

    return () => {
      mediaQuery.removeEventListener("change", listener);
      clearTimeout(splashTimer);
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (window.innerWidth < 1024 || prefersReducedMotion) return;
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    const x = ((clientX - innerWidth / 2) / innerWidth) * 8;
    const y = ((clientY - innerHeight / 2) / innerHeight) * 8;
    setCoords({ x, y });
  };

  const validate = () => {
    const newErrors: typeof errors = {};
    const hasEmpId = !!employeeId.trim();
    const hasPass = !!password;

    if (!hasEmpId && !hasPass) {
      newErrors.employeeId = "Please enter your Employee ID and Password.";
      newErrors.password = "Please enter your Employee ID and Password.";
    } else {
      if (!hasEmpId) {
        newErrors.employeeId = "Employee ID is required.";
      }
      if (!hasPass) {
        newErrors.password = "Password is required.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRetry = () => {
    setPassword("");
    setAuthError("");
    setErrors({});
    setTimeout(() => {
      passwordRef.current?.focus();
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setPassword("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setAuthError("");

    if (!validate()) {
      setShakeCard(true);
      setTimeout(() => setShakeCard(false), 350);
      return;
    }

    setIsSubmitting(true);
    setAuthStatusText("Authenticating...");

    setTimeout(() => {
      const success = login(employeeId, password);
      if (success) {
        setIsSuccess(true);
        setAuthStatusText("Success!");
        setFailedAttempts(0);

        setTimeout(() => {
          setIsTransitioning(true);
          setTimeout(() => {
            navigate("/");
          }, 600);
        }, 1000);
      } else {
        setIsSubmitting(false);
        setAuthStatusText("Sign In to Portal");
        setPassword("");
        setFailedAttempts((prev) => prev + 1);
        setAuthError("❌ Invalid Employee ID or Password\nPlease verify your credentials and try again.");

        setShakeCard(true);
        setTimeout(() => setShakeCard(false), 350);

        setTimeout(() => {
          passwordRef.current?.focus();
        }, 50);

        setTimeout(() => {
          setAuthError("");
        }, 4000);
      }
    }, 1200);
  };

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      className={`min-h-screen h-screen w-full relative overflow-hidden transition-all duration-700 font-sans ${
        isTransitioning ? "scale-105 blur-lg opacity-0 pointer-events-none" : "scale-100 opacity-100"
      } ${
        theme === "dark"
          ? "bg-[#060B16] text-slate-100"
          : "bg-[#F0F5FD] text-slate-900"
      }`}
    >
      <style>{`
        .cad-grid-light {
          background-size: 32px 32px;
          background-image: 
            linear-gradient(to right, rgba(37, 99, 235, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(37, 99, 235, 0.05) 1px, transparent 1px);
        }
        .cad-grid-dark {
          background-size: 32px 32px;
          background-image: 
            linear-gradient(to right, rgba(6, 182, 212, 0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6, 182, 212, 0.06) 1px, transparent 1px);
        }
        @keyframes float-hero-1 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-9px); }
        }
        @keyframes float-hero-2 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(11px); }
        }
        @keyframes pipeline-flow {
          0% { stroke-dashoffset: 120; }
          100% { stroke-dashoffset: 0; }
        }
        .animate-float-1 { animation: float-hero-1 6.5s ease-in-out infinite; }
        .animate-float-2 { animation: float-hero-2 8.5s ease-in-out infinite; }
        .animate-float-3 { animation: float-hero-1 7.5s ease-in-out infinite; }
        .animate-float-4 { animation: float-hero-2 9.5s ease-in-out infinite; }
        .animate-float-5 { animation: float-hero-1 10.5s ease-in-out infinite; }
        .animate-float-6 { animation: float-hero-2 11.5s ease-in-out infinite; }

        .perspective-container {
          perspective: 1200px;
        }

        .glass-login-panel {
          backdrop-filter: blur(28px) saturate(160%);
          background: ${theme === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)'};
          border: 1px solid ${theme === 'dark' ? 'rgba(51, 65, 85, 0.85)' : 'rgba(255, 255, 255, 0.95)'};
          box-shadow: ${
            theme === 'dark'
              ? '0 35px 70px -15px rgba(0, 0, 0, 0.75), 0 0 35px rgba(6, 182, 212, 0.15)'
              : '0 35px 70px -15px rgba(15, 23, 42, 0.14), 0 0 35px rgba(37, 99, 235, 0.08)'
          };
          transform: rotateY(3deg) rotateX(1.5deg);
          transition: transform 0.5s ease-out, box-shadow 0.5s ease-out, background-color 0.4s ease;
        }

        .glass-login-panel:hover {
          transform: rotateY(1deg) rotateX(0.5deg) translateY(-2px);
          box-shadow: ${
            theme === 'dark'
              ? '0 40px 80px -15px rgba(0, 0, 0, 0.8), 0 0 45px rgba(6, 182, 212, 0.22)'
              : '0 40px 80px -15px rgba(15, 23, 42, 0.18), 0 0 45px rgba(37, 99, 235, 0.12)'
          };
        }

        .glass-kpi-card {
          backdrop-filter: blur(16px) saturate(160%);
          background: ${theme === 'dark' ? 'rgba(15, 23, 42, 0.84)' : 'rgba(255, 255, 255, 0.88)'};
          border: 1px solid ${theme === 'dark' ? 'rgba(51, 65, 85, 0.75)' : 'rgba(255, 255, 255, 0.95)'};
          box-shadow: ${theme === 'dark' ? '0 12px 30px rgba(0,0,0,0.45)' : '0 12px 30px rgba(37,99,235,0.08)'};
        }
        .glass-building-sign {
          backdrop-filter: blur(16px);
          background: ${theme === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)'};
          border: 1px solid ${theme === 'dark' ? 'rgba(6, 182, 212, 0.5)' : 'rgba(37, 99, 235, 0.35)'};
          box-shadow: 0 8px 24px rgba(6, 182, 212, 0.2);
        }

        @keyframes card-shake {
          0%, 100% { transform: rotateY(3deg) rotateX(1.5deg) translateX(0); }
          20%, 60% { transform: rotateY(3deg) rotateX(1.5deg) translateX(-6px); }
          40%, 80% { transform: rotateY(3deg) rotateX(1.5deg) translateX(6px); }
        }
        .shake-error {
          animation: card-shake 0.35s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .glass-login-panel {
            transform: none !important;
          }
          .animate-float-1, .animate-float-2, .animate-float-3, .animate-float-4, .animate-float-5, .animate-float-6 {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Floating Theme Switcher Button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="
          fixed
          top-5
          right-6
          z-50
          px-4
          py-2
          rounded-full
          border
          border-slate-200
          dark:border-slate-700
          bg-white/90
          dark:bg-slate-900/90
          backdrop-blur-md
          text-slate-800
          dark:text-amber-400
          hover:scale-105
          active:scale-95
          shadow-lg
          cursor-pointer
          flex
          items-center
          gap-2
          text-xs
          font-extrabold
          transition-all
          duration-300
        "
        aria-label="Toggle theme"
      >
        {theme === "dark" ? (
          <>
            <Sun size={14} className="text-amber-400" />
            <span>Light Mode</span>
          </>
        ) : (
          <>
            <Moon size={14} className="text-slate-800" />
            <span className="text-slate-800">Dark Mode</span>
          </>
        )}
      </button>

      {/* ════════ ONE SINGLE CONTINUOUS CANVAS (FULL BROWSER WIDTH BACKGROUND) ════════ */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">

        {/* Global Continuous Blueprint CAD Line Grid */}
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 z-0 ${
          theme === "dark" ? "cad-grid-dark opacity-45" : "cad-grid-light opacity-70"
        }`} />
        <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full bg-blue-500/8 dark:bg-cyan-500/8 blur-[140px] pointer-events-none z-0" />

        {/* Full-Bleed Edge-to-Edge 3D Isometric Engineering Ecosystem Background */}
        <div
          style={{ transform: `translate3d(${coords.x * 0.4}px, ${coords.y * 0.4}px, 0)` }}
          className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-out"
        >
          <img
            src="/pmo_control_room.jpg"
            alt="iFluids Engineering PMO Digital Twin Control Room Ecosystem"
            className={`w-full h-full object-cover object-center transition-all duration-700 ${
              theme === "dark" ? "brightness-[0.78] contrast-[1.12]" : "brightness-[0.98] contrast-[1.02]"
            }`}
          />
          {/* Ambient Overlay Glow */}
          <div className="absolute inset-0 bg-gradient-to-t from-blue-950/30 via-transparent to-blue-500/10 pointer-events-none" />
        </div>

        {/* SVG Animated Data Streams */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-15" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="pmoFluentStreamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#06B6D4" stopOpacity="1" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <path d="M 280,240 Q 480,340 640,260" fill="none" stroke="url(#pmoFluentStreamGrad)" strokeWidth="2" strokeDasharray="6 6" className="animate-[pipeline-flow_3.5s_linear_infinite]" />
          <path d="M 640,260 Q 760,400 520,500" fill="none" stroke="url(#pmoFluentStreamGrad)" strokeWidth="2" strokeDasharray="6 6" className="animate-[pipeline-flow_4.5s_linear_infinite]" />
        </svg>

        {/* Clean Central Building Branding Signage */}
        <div className="absolute top-[42%] left-[54%] -translate-x-1/2 -translate-y-1/2 z-25 pointer-events-auto">
          <div className="glass-building-sign rounded-2xl px-5 py-2 flex items-center gap-2.5 shadow-xl animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <h3 className="text-xs font-black text-slate-900 dark:text-white tracking-tight">
              iFluids Engineering PMO
            </h3>
          </div>
          <div className="mt-2 text-center">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] px-3 py-1 rounded-full bg-slate-900/80 text-cyan-300 backdrop-blur-md border border-cyan-500/30">
              iFluids Engineering
            </span>
          </div>
        </div>

        {/* Connected Floating Module Hubs (Organic Staggered Offsets) */}
        <div className="absolute inset-0 pointer-events-none z-20 hidden lg:block">
          {/* Hub 1: Project Repository */}
          <div className="absolute top-[19%] left-[43%] glass-building-sign rounded-xl px-3 py-1.5 flex items-center gap-2 pointer-events-auto animate-float-1">
            <FolderGit2 size={13} className="text-blue-500" />
            <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200">Project Repository</span>
          </div>

          {/* Hub 2: Work Orders */}
          <div className="absolute top-[14%] right-[16%] glass-building-sign rounded-xl px-3 py-1.5 flex items-center gap-2 pointer-events-auto animate-float-2">
            <FileText size={13} className="text-indigo-500" />
            <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200">Work Orders</span>
          </div>

          {/* Hub 3: Invoice Management */}
          <div className="absolute top-[33%] right-[7%] glass-building-sign rounded-xl px-3 py-1.5 flex items-center gap-2 pointer-events-auto animate-float-3">
            <BadgeIndianRupee size={13} className="text-emerald-500" />
            <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200">Invoice Management</span>
          </div>

          {/* Hub 4: Resource Planning */}
          <div className="absolute top-[39%] left-[36%] glass-building-sign rounded-xl px-3 py-1.5 flex items-center gap-2 pointer-events-auto animate-float-4">
            <Users size={13} className="text-orange-500" />
            <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200">Resource Planning</span>
          </div>

          {/* Hub 5: Timesheets */}
          <div className="absolute bottom-[24%] left-[37%] glass-building-sign rounded-xl px-3 py-1.5 flex items-center gap-2 pointer-events-auto animate-float-5">
            <Calendar size={13} className="text-cyan-500" />
            <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200">Timesheets</span>
          </div>

          {/* Hub 6: Deliverables Control */}
          <div className="absolute bottom-[23%] right-[11%] glass-building-sign rounded-xl px-3 py-1.5 flex items-center gap-2 pointer-events-auto animate-float-6">
            <Cpu size={13} className="text-blue-500" />
            <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200">Deliverables Control</span>
          </div>
        </div>

        {/* 6 Floating Glass KPI Cards Organically Staggered Surrounding Ecosystem */}
        <div
          style={{ transform: `translate3d(${coords.x * -0.5}px, ${coords.y * -0.5}px, 0)` }}
          className="relative z-25 w-full h-full pointer-events-none transition-transform duration-500 ease-out"
        >

          {/* KPI Card 1: Top Left-Center - Active Projects */}
          <div className="absolute top-[6%] left-[38%] lg:left-[40%] glass-kpi-card rounded-2xl p-4 min-w-[200px] animate-float-1 pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-9.5 h-9.5 rounded-xl bg-blue-500/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                <FolderGit2 size={19} />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Active Projects
                </p>
                <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                  245
                </p>
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                  <TrendingUp size={10} /> +23 Added this month
                </p>
              </div>
            </div>
          </div>

          {/* KPI Card 2: Top Far Right - Project Portfolio Value */}
          <div className="absolute top-[6%] right-[3%] lg:right-[4%] glass-kpi-card rounded-2xl p-4 min-w-[220px] animate-float-2 pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-9.5 h-9.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <span className="font-extrabold text-base">₹</span>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Project Portfolio
                </p>
                <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                  ₹126 Cr
                </p>
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                  <TrendingUp size={10} /> ↑18% vs last month
                </p>
              </div>
            </div>
          </div>

          {/* KPI Card 3: Mid-Lower Center-Left - Delivery Rate */}
          <div className="absolute top-[52%] left-[41%] lg:left-[42%] glass-kpi-card rounded-2xl p-4 min-w-[190px] animate-float-3 pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-9.5 h-9.5 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                <Award size={19} />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  On-Time Delivery
                </p>
                <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                  98%
                </p>
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                  <TrendingUp size={10} /> ↑7% improvement
                </p>
              </div>
            </div>
          </div>

          {/* KPI Card 4: Mid-Upper Right - Engineers */}
          <div className="absolute top-[46%] right-[2%] lg:right-[3%] glass-kpi-card rounded-2xl p-4 min-w-[200px] animate-float-4 pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-9.5 h-9.5 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                <Users size={19} />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Engineers
                </p>
                <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                  850
                </p>
                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                  Across 14 Locations
                </p>
              </div>
            </div>
          </div>

          {/* KPI Card 5: Bottom Left-Center - Document Control */}
          <div className="absolute bottom-[4%] left-[43%] lg:left-[44%] glass-kpi-card rounded-2xl p-4 min-w-[210px] animate-float-5 pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-9.5 h-9.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <FileSpreadsheet size={19} />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Document Control
                </p>
                <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                  15,280
                </p>
                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                  Engineering Documents
                </p>
              </div>
            </div>
          </div>

          {/* KPI Card 6: Bottom Far Right - Active Deliverables */}
          <div className="absolute bottom-[5%] right-[4%] lg:right-[5%] glass-kpi-card rounded-2xl p-4 min-w-[200px] animate-float-6 pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-9.5 h-9.5 rounded-xl bg-blue-500/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                <Layers size={19} />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Active Deliverables
                </p>
                <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                  2,300
                </p>
                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                  Tracked Work Packages
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ════════ SINGLE FLOATING 3D PERSPECTIVE GLASS LOGIN CARD (+10% REFINED SIZE) ════════ */}
      <div className="perspective-container absolute left-[3%] sm:left-[5%] lg:left-[7%] top-1/2 -translate-y-1/2 z-30 w-full max-w-[450px] lg:max-w-[475px] px-3 pointer-events-auto">
        <div className={`glass-login-panel rounded-[28px] p-8 sm:p-9 lg:p-10 relative overflow-hidden transition-all duration-300 ${
          shakeCard ? "shake-error" : ""
        }`}>

          {/* Accent Line */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-600" />

          {/* Success Overlay */}
          {isSuccess && (
            <div className="absolute inset-0 bg-white dark:bg-[#0F172A] flex flex-col items-center justify-center text-center p-6 z-30 animate-in fade-in duration-300 rounded-[28px]">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20 shadow-md">
                <Check size={28} className="animate-bounce" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                ✔ Authentication Successful
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Welcome to iFluids PMO Portal
              </p>
            </div>
          )}

          {/* Logo & Portal Heading */}
          <div className="mb-6.5">
            <Logo
              alt="iFluids Engineering"
              imageClassName="h-13.5 lg:h-15 w-auto object-contain"
              darkImageClassName="h-18 lg:h-20 w-auto object-contain"
              containerClassName="px-5 py-3 mb-5"
            />

            <h1 className="text-xl sm:text-2xl lg:text-[26px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-snug">
              Engineering Project Management Portal
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 font-medium leading-relaxed">
              <strong className="text-blue-600 dark:text-cyan-400">Plan. Execute. Monitor. Deliver.</strong><br />
              One intelligent platform for engineering project delivery.
            </p>
          </div>

          {/* Failed attempts warning */}
          {failedAttempts >= 3 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs font-semibold text-amber-600 dark:text-amber-400 mb-4">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span className="leading-snug">
                ⚠ Multiple unsuccessful login attempts detected.<br />
                Please verify your Employee ID and Password.
              </span>
            </div>
          )}

          {/* Auth Error Banner */}
          {authError && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/20 p-3 text-xs font-semibold text-red-600 dark:text-red-400 mb-4">
              <div className="flex items-start gap-2">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                <span className="leading-snug whitespace-pre-line">{authError}</span>
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="text-left text-[11px] font-extrabold text-red-600 dark:text-red-400 hover:underline pl-6 cursor-pointer border-none bg-transparent outline-none"
              >
                ↻ Try Again
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4.5">

            {/* Employee ID */}
            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Employee ID
              </label>
              <div className="relative">
                <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                  isIdFocused ? "text-blue-600 dark:text-cyan-400" : "text-slate-400 dark:text-slate-500"
                }`}>
                  <User size={16} />
                </span>
                <input
                  ref={employeeIdRef}
                  type="text"
                  value={employeeId}
                  onFocus={() => setIsIdFocused(true)}
                  onBlur={() => setIsIdFocused(false)}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    if (errors.employeeId) setErrors((prev) => ({ ...prev, employeeId: undefined }));
                  }}
                  placeholder="e.g. PMOV1"
                  className={`w-full h-11 pl-10 pr-4 rounded-xl border text-xs font-medium outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-all duration-200 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                    errors.employeeId
                      ? "border-red-500 focus:border-red-500"
                      : "border-slate-200 dark:border-slate-700 focus:border-blue-600 dark:focus:border-cyan-400"
                  }`}
                />
              </div>
              {errors.employeeId && (
                <p className="text-[11px] text-red-600 dark:text-red-400 font-bold mt-1">
                  {errors.employeeId}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Password
                </label>
                <span className="text-[11px] text-blue-600 dark:text-cyan-400 font-bold hover:underline cursor-pointer">
                  Forgot Password?
                </span>
              </div>
              <div className="relative">
                <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                  isPassFocused ? "text-blue-600 dark:text-cyan-400" : "text-slate-400 dark:text-slate-500"
                }`}>
                  <Lock size={16} />
                </span>
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onFocus={() => setIsPassFocused(true)}
                  onBlur={() => setIsPassFocused(false)}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="Enter your password"
                  className={`w-full h-11 pl-10 pr-11 rounded-xl border text-xs font-medium outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-all duration-200 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                    errors.password || authError
                      ? "border-red-500 focus:border-red-500"
                      : "border-slate-200 dark:border-slate-700 focus:border-blue-600 dark:focus:border-cyan-400"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-blue-600 transition-colors cursor-pointer border-none bg-transparent outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] text-red-600 dark:text-red-400 font-bold mt-1">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                  Remember me
                </span>
              </label>
            </div>

            {/* Primary Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full h-11.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all duration-300 shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-85 text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 ${
                isSuccess ? "bg-emerald-600" : ""
              }`}
            >
              {isSubmitting ? (
                <>
                  {isSuccess ? (
                    <Check size={18} className="text-white animate-bounce" />
                  ) : (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>{authStatusText}</span>
                </>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ChevronRight size={16} />
                </>
              )}
            </button>

            {/* OR Divider */}
            <div className="relative py-1.5 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <span className="relative px-3 bg-white dark:bg-slate-900 text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                OR
              </span>
            </div>

            {/* Secondary Microsoft Sign In Button */}
            <button
              type="button"
              onClick={() => handleSubmit({ preventDefault: () => {} } as any)}
              className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer shadow-xs"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 23 23">
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 1h10v10H12z"/>
              </svg>
              <span>Sign in with Microsoft</span>
            </button>
          </form>

          {/* Security Footer & Copyright (Inside Card Bottom) */}
          <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-800 flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-bold">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span>Secure &bull; Reliable &bull; Always Available</span>
            </div>
            <p className="text-center text-[10.5px] text-slate-400 dark:text-slate-500 font-medium">
              &copy; {new Date().getFullYear()} iFluids Engineering | All Rights Reserved
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
