import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Eye, EyeOff, Lock, User, Sun, Moon, ShieldAlert, Check,
  LayoutDashboard, FolderGit2, Users2, BadgeIndianRupee, ChevronRight 
} from "lucide-react";
import { useAuth } from "../../auth/authContext";
import { useTheme } from "../../context/ThemeContext";
import SplashScreen from "../../components/Splash/SplashScreen";
import { Logo } from "../../components/ui/Logo";

export default function Login() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

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
  
  // Failed Attempt Tracking
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Splash & Transition States
  const [showSplash, setShowSplash] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Parallax Coordinate States
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  // Staggered Card Highlight State
  const [highlightedCard, setHighlightedCard] = useState(0);

  // Reduced Motion Media Query State
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Mount listeners
  useEffect(() => {
    // 1. Reduced motion check
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);

    // 2. Splash screen duration (holds for 2.8 seconds)
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2800);

    // 3. Staggered feature card highlight interval (every 8s)
    const highlightInterval = setInterval(() => {
      setHighlightedCard((prev) => {
        let next = prev;
        while (next === prev) {
          next = Math.floor(Math.random() * 4);
        }
        return next;
      });
    }, 8000);

    return () => {
      mediaQuery.removeEventListener("change", listener);
      clearTimeout(splashTimer);
      clearInterval(highlightInterval);
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

    // Simulate brief secure check delay
    setTimeout(() => {
      const success = login(employeeId, password);
      if (success) {
        setIsSuccess(true);
        setAuthStatusText("Success!");
        setFailedAttempts(0);
        
        // Start dashboard transition sequence (shrink logo, fade card, blur background)
        setTimeout(() => {
          setIsTransitioning(true);
          setTimeout(() => {
            navigate("/");
          }, 600);
        }, 1000); // Hold success state for 1 second
      } else {
        setIsSubmitting(false);
        setAuthStatusText("Sign In to Portal");
        setPassword("");
        setFailedAttempts((prev) => prev + 1);
        setAuthError("❌ Invalid Employee ID or Password\nPlease verify your credentials and try again.");
        
        // Shake card
        setShakeCard(true);
        setTimeout(() => setShakeCard(false), 350);

        // Focus password input
        setTimeout(() => {
          passwordRef.current?.focus();
        }, 50);

        // Auto fade error banner after 3 seconds
        setTimeout(() => {
          setAuthError("");
        }, 3000);
      }
    }, 1200);
  };

  // Splash Screen Rendering Mode
  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <div 
      onMouseMove={handleMouseMove}
      className={`min-h-screen w-full flex items-center justify-center relative overflow-hidden transition-all duration-700 ${
        isTransitioning ? "scale-105 blur-lg opacity-0 pointer-events-none" : "scale-100 opacity-100"
      } ${
        theme === "dark" 
          ? "bg-gradient-to-br from-[#0B1528] via-[#111C33] to-[#090D1A]" 
          : "bg-gradient-to-br from-[#F8FAFC] via-[#F1F5F9] to-[#E2E8F0]"
      }`}
    >
      <style>{`
        .blueprint-grid {
          background-size: 40px 40px;
          background-image: 
            linear-gradient(to right, ${theme === 'dark' ? 'rgba(56, 189, 248, 0.03)' : 'rgba(14, 165, 233, 0.04)'} 1px, transparent 1px),
            linear-gradient(to bottom, ${theme === 'dark' ? 'rgba(56, 189, 248, 0.03)' : 'rgba(14, 165, 233, 0.04)'} 1px, transparent 1px);
        }
        .blueprint-dots {
          background-size: 20px 20px;
          background-image: radial-gradient(${theme === 'dark' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(14, 165, 233, 0.08)'} 1px, transparent 1px);
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-20px) scale(1.04); }
        }
        @keyframes float-medium {
          0%, 100% { transform: translateY(0px) scale(1.04); }
          50% { transform: translateY(15px) scale(0.96); }
        }
        @keyframes gradient-move {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-float-1 {
          animation: float-slow 16s ease-in-out infinite;
        }
        .animate-float-2 {
          animation: float-medium 20s ease-in-out infinite;
        }
        .animated-bg {
          background-size: 200% 200%;
          animation: gradient-move 15s ease infinite;
        }
        .glass-panel {
          backdrop-filter: blur(28px) saturate(145%);
          background: ${theme === 'dark' ? 'rgba(17, 24, 39, 0.85)' : 'rgba(255, 255, 255, 0.85)'};
          border: 1px solid ${theme === 'dark' ? 'rgba(51, 65, 85, 0.9)' : 'rgba(203, 213, 225, 0.9)'};
          box-shadow: ${theme === 'dark' ? '0 20px 40px rgba(0,0,0,0.45)' : '0 20px 40px rgba(15,23,42,0.08)'};
          transition: background-color 400ms ease, border-color 400ms ease, box-shadow 400ms ease;
        }
        .glass-input {
          background: ${theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 1)'};
          border-color: ${theme === 'dark' ? 'rgba(75, 85, 99, 0.8)' : 'rgba(209, 213, 219, 1)'};
          color: ${theme === 'dark' ? '#F8FAFC' : '#0F172A'};
        }
        .btn-glow {
          box-shadow: 0 0 20px rgba(14, 165, 233, 0.35);
        }
        .btn-glow:hover {
          box-shadow: 0 0 32px rgba(14, 165, 233, 0.55);
        }
        @keyframes logo-breathe {
          0%, 100% { transform: translateY(0px) scale(1); filter: drop-shadow(0 4px 10px rgba(0,0,0,0.06)); }
          50% { transform: translateY(-4px) scale(1.02); filter: drop-shadow(0 8px 16px rgba(14, 165, 233, 0.12)); }
        }
        .persistent-logo-anim {
          animation: logo-breathe 4.5s ease-in-out infinite;
        }
        @keyframes fade-up-scale {
          0% { opacity: 0; transform: translateY(16px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0px) scale(1); }
        }
        .animate-fade-up {
          opacity: 0;
          animation: fade-up-scale 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
        .delay-400 { animation-delay: 400ms; }
        .delay-500 { animation-delay: 500ms; }
        .delay-600 { animation-delay: 600ms; }
        .delay-700 { animation-delay: 700ms; }
        .delay-800 { animation-delay: 800ms; }

        @keyframes input-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
        .shake-error {
          animation: input-shake 0.3s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-float-1, .animate-float-2, .persistent-logo-anim, .splash-logo-wrapper, .glow-effect, .sweep-effect {
            animation: none !important;
            transform: none !important;
            box-shadow: none !important;
          }
          .animate-fade-up {
            opacity: 1 !important;
            transform: none !important;
            animation: none !important;
          }
        }
      `}</style>

      {/* Background Graphic Elements */}
      <div className="absolute inset-0 blueprint-grid pointer-events-none" />
      <div className="absolute inset-0 blueprint-dots pointer-events-none" />
      
      {/* Blurred mesh gradients */}
      <div 
        style={{ transform: `translate3d(${coords.x * -1.5}px, ${coords.y * -1.5}px, 0)` }}
        className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-500/10 dark:bg-cyan-500/10 blur-[130px] pointer-events-none animate-float-1" 
      />
      <div 
        style={{ transform: `translate3d(${coords.x * 1.5}px, ${coords.y * 1.5}px, 0)` }}
        className="absolute -bottom-45 right-0 w-[550px] h-[550px] rounded-full bg-emerald-500/5 dark:bg-blue-600/10 blur-[120px] pointer-events-none animate-float-2" 
      />

      {/* High-Contrast Floating Theme Switcher Button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="
          absolute
          top-6
          right-6
          px-4
          py-2.5
          rounded-xl
          border
          border-slate-350
          dark:border-slate-750
          bg-white
          dark:bg-slate-900
          text-slate-800
          dark:text-amber-400
          hover:scale-105
          active:scale-95
          shadow-lg
          shadow-blue-500/5
          z-50
          cursor-pointer
          flex
          items-center
          gap-2
          text-[12.5px]
          font-bold
          transition-all
          duration-300
        "
        aria-label="Toggle theme"
      >
        {theme === "dark" ? (
          <>
            <Sun size={15} className="text-amber-400" />
            <span className="text-amber-400">Light Mode</span>
          </>
        ) : (
          <>
            <Moon size={15} className="text-slate-800" />
            <span className="text-slate-800 font-bold">Dark Mode</span>
          </>
        )}
      </button>

      {/* Main Workspace Frame */}
      <div 
        style={{ transform: `translate3d(${coords.x * 0.5}px, ${coords.y * 0.5}px, 0)` }}
        className="w-full max-w-[1240px] px-6 lg:px-8 py-10 z-10 flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-14 min-h-[85vh] transition-transform duration-500 ease-out"
      >
        
        {/* Left Side: Branding and Features (55%) */}
        <div className="flex-1 lg:w-[55%] flex flex-col justify-between py-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3.5 animate-fade-up">
              <div className="bg-white px-4.5 py-2.5 rounded-[14px] shadow-md border border-white/30 flex items-center justify-center">
                <Logo
                  alt="iFluids Official Logo"
                  className="h-8.5 w-auto object-contain"
                />
              </div>
              <div>
                <h4 className="text-[12.5px] font-black tracking-[0.2em] text-blue-600 dark:text-cyan-400 uppercase leading-none">
                  PMO PORTAL
                </h4>
                <p className="text-[11.5px] font-bold text-slate-500 dark:text-slate-350 tracking-tight leading-none mt-1.5">
                  Engineering Project Management Office
                </p>
              </div>
            </div>

            <div className="pt-2 animate-fade-up delay-100">
              <h1 className="text-[34px] sm:text-[42px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.15]">
                Engineering Project <br />
                <span className="bg-gradient-to-r from-blue-600 to-teal-500 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Management Portal
                </span>
              </h1>
              <p className="text-[14px] text-slate-600 dark:text-slate-300 font-medium mt-3 leading-relaxed">
                Commercial Management &bull; Project Execution &bull; Resource Planning &bull; Financial Tracking
              </p>
            </div>
          </div>

          {/* Animated Feature Cards Row with High Contrast */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 lg:mt-10 animate-fade-up delay-200">
            {/* Card 1 */}
            <div 
              className={`group p-4.5 rounded-2xl border transition-all duration-300 ${
                highlightedCard === 0
                  ? "border-blue-500/50 shadow-md bg-white dark:bg-slate-900"
                  : "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 hover:shadow-lg hover:-translate-y-0.5"
              }`}
            >
              <div className="w-9.5 h-9.5 rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center transition-transform group-hover:scale-110">
                <LayoutDashboard size={19} />
              </div>
              <h3 className="text-[14px] font-bold text-slate-800 dark:text-slate-100 mt-3">Live Dashboard</h3>
              <p className="text-[12.5px] text-slate-600 dark:text-slate-350 mt-1 leading-relaxed">
                Real-time project scheduling KPI analytics and workload summary visibility.
              </p>
            </div>

            {/* Card 2 */}
            <div 
              className={`group p-4.5 rounded-2xl border transition-all duration-300 ${
                highlightedCard === 1
                  ? "border-blue-500/50 shadow-md bg-white dark:bg-slate-900"
                  : "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 hover:shadow-lg hover:-translate-y-0.5"
              }`}
            >
              <div className="w-9.5 h-9.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 flex items-center justify-center transition-transform group-hover:scale-110">
                <FolderGit2 size={19} />
              </div>
              <h3 className="text-[14px] font-bold text-slate-800 dark:text-slate-100 mt-3">Project Repository</h3>
              <p className="text-[12.5px] text-slate-600 dark:text-slate-350 mt-1 leading-relaxed">
                Complete workspace folder layouts with client contracts, work order logs.
              </p>
            </div>

            {/* Card 3 */}
            <div 
              className={`group p-4.5 rounded-2xl border transition-all duration-300 ${
                highlightedCard === 2
                  ? "border-blue-500/50 shadow-md bg-white dark:bg-slate-900"
                  : "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 hover:shadow-lg hover:-translate-y-0.5"
              }`}
            >
              <div className="w-9.5 h-9.5 rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400 flex items-center justify-center transition-transform group-hover:scale-110">
                <Users2 size={19} />
              </div>
              <h3 className="text-[14px] font-bold text-slate-800 dark:text-slate-100 mt-3">Resource Management</h3>
              <p className="text-[12.5px] text-slate-600 dark:text-slate-350 mt-1 leading-relaxed">
                Employee manpower lists, manager tracking, and active assignments.
              </p>
            </div>

            {/* Card 4 */}
            <div 
              className={`group p-4.5 rounded-2xl border transition-all duration-300 ${
                highlightedCard === 3
                  ? "border-blue-500/50 shadow-md bg-white dark:bg-slate-900"
                  : "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 hover:shadow-lg hover:-translate-y-0.5"
              }`}
            >
              <div className="w-9.5 h-9.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center transition-transform group-hover:scale-110">
                <BadgeIndianRupee size={19} />
              </div>
              <h3 className="text-[14px] font-bold text-slate-800 dark:text-slate-100 mt-3">Financial Analytics</h3>
              <p className="text-[12.5px] text-slate-600 dark:text-slate-350 mt-1 leading-relaxed">
                Expense budget sheets, invoices trackers, and automated profit margins.
              </p>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11.5px] text-slate-500 dark:text-slate-400 font-bold animate-fade-up delay-300">
            <span>Powered by iFluids Tech Group</span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>All Systems Operational</span>
            </div>
          </div>
        </div>

        {/* Right Side: Premium Glass Login Card (45%) */}
        <div className="lg:w-[45%] flex items-center justify-center w-full">
          <div className={`w-full max-w-[440px] glass-panel rounded-[24px] p-8 lg:p-9 shadow-2xl relative overflow-hidden animate-fade-up delay-200 ${
            shakeCard ? "shake-error" : ""
          }`}>
            
            {/* Ambient card top border sweep light */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />

            {/* Premium success overlay frame */}
            {isSuccess && (
              <div className="absolute inset-0 bg-white dark:bg-[#111827] flex flex-col items-center justify-center text-center p-6 z-30 animate-in fade-in duration-300 rounded-[24px]">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-4 border border-emerald-500/20 shadow-md">
                  <Check size={28} className="animate-bounce" />
                </div>
                <h3 className="text-[17px] font-bold text-slate-950 dark:text-white">
                  ✔ Authentication Successful
                </h3>
                <p className="text-[13.5px] text-slate-500 dark:text-slate-300 mt-1.5 leading-relaxed">
                  Welcome to iFluids PMO Portal
                </p>
              </div>
            )}
            
            {/* Header / Logo */}
            <div className="text-center mb-6 animate-fade-up delay-300">
              <div className="inline-flex items-center justify-center bg-white px-5 py-3 rounded-2xl shadow-md border border-white/20 mb-4 persistent-logo-anim">
                <Logo
                  alt="iFluids Header Logo"
                  className="h-8.5 w-auto object-contain"
                />
              </div>
              <h2 className="text-[20px] font-extrabold text-slate-900 dark:text-white tracking-tight">
                Welcome Back
              </h2>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-300 mt-0.5">
                Sign in to continue to your workspace
              </p>
            </div>

            {/* Multiple failed login attempts counter warning banner */}
            {failedAttempts >= 3 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-yellow-500/35 bg-yellow-50 dark:bg-yellow-950/20 p-3.5 text-[12px] font-semibold text-yellow-600 dark:text-yellow-400 mb-5 animate-in fade-in duration-300">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                <span className="leading-snug">
                  ⚠ Multiple unsuccessful login attempts detected.<br />
                  Please verify your Employee ID and Password before trying again.
                </span>
              </div>
            )}

            {/* Global Auth Error Alert with Try Again action */}
            {authError && (
              <div className="flex flex-col gap-2 rounded-xl border border-red-500/25 bg-red-50 dark:bg-red-950/20 p-3.5 text-[12px] font-semibold text-red-600 dark:text-red-400 mb-5 animate-in fade-in slide-in-from-top-3 duration-300">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  <span className="leading-snug whitespace-pre-line">{authError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="text-left text-[11px] font-extrabold text-red-600 dark:text-red-400 hover:underline pl-6.5 cursor-pointer border-none bg-transparent outline-none"
                >
                  ↻ Try Again
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4.5">
              {/* Employee ID Field */}
              <div className="space-y-1.5 animate-fade-up delay-400">
                <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Employee ID
                </label>
                <div className="relative">
                  <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                    isIdFocused ? "text-blue-500" : "text-slate-400 dark:text-slate-500"
                  }`}>
                    <User size={15} />
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
                    className={`w-full h-10.5 pl-10 pr-4 rounded-xl border glass-input text-[13px] outline-none focus:scale-[1.01] focus:shadow-md focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                      errors.employeeId
                        ? "border-red-500 focus:ring-red-500/15 focus:border-red-500"
                        : "border-slate-300 dark:border-slate-700/80"
                    }`}
                  />
                </div>
                {errors.employeeId && (
                  <p className="text-[11.5px] text-red-650 dark:text-red-400 font-bold mt-1 animate-in fade-in duration-200">
                    {errors.employeeId}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-1.5 animate-fade-up delay-500">
                <div className="flex justify-between items-center">
                  <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Password
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 cursor-not-allowed hover:underline font-bold">
                    Forgot Password?
                  </span>
                </div>
                <div className="relative">
                  <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                    isPassFocused ? "text-blue-500" : "text-slate-400 dark:text-slate-500"
                  }`}>
                    <Lock size={15} />
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
                    placeholder="Enter Portal Password"
                    className={`w-full h-10.5 pl-10 pr-11 rounded-xl border glass-input text-[13px] outline-none focus:scale-[1.01] focus:shadow-md focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                      errors.password || authError
                        ? "border-red-500 focus:ring-red-500/15 focus:border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.25)]"
                        : "border-slate-300 dark:border-slate-700/80"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-blue-500 transition-colors cursor-pointer border-none bg-transparent outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11.5px] text-red-650 dark:text-red-400 font-bold mt-1 animate-in fade-in duration-200">
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center pt-1 animate-fade-up delay-600">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded-lg border-slate-300 dark:border-slate-750 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-slate-900 cursor-pointer"
                  />
                  <span className="text-[12px] text-slate-700 dark:text-slate-300 font-bold">
                    Remember my credentials
                  </span>
                </label>
              </div>

              {/* Login Button with Premium Glow */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full h-11 rounded-xl text-[13.5px] font-bold transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-85 disabled:cursor-not-allowed btn-glow text-white animate-fade-up delay-700 ${
                  isSuccess 
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20" 
                    : "bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600"
                }`}
              >
                {isSubmitting ? (
                  <>
                    {isSuccess ? (
                      <Check size={18} className="text-white animate-[bounce_0.5s_infinite]" />
                    ) : (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    <span>{authStatusText}</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Portal</span>
                    <ChevronRight size={15} className="mt-0.5" />
                  </>
                )}
              </button>
            </form>

            {/* Footer company warnings & version info */}
            <div className="text-center mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-col gap-1 animate-fade-up delay-800">
              <p className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                For Internal Company Use Only
              </p>
              <p className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500">
                PMO Portal v1.0 &bull; Secure Connection
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
