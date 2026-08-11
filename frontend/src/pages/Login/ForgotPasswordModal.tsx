import { useState } from "react";
import type { FormEvent } from "react";
import { Mail, X, Check, ShieldAlert } from "lucide-react";
import { authService } from "../../auth/authService";
import { ApiError } from "../../services/apiClient";

interface ForgotPasswordModalProps {
  onClose: () => void;
}

const GENERIC_MESSAGE = "If the account exists, a password reset email has been sent.";

export default function ForgotPasswordModal({ onClose }: ForgotPasswordModalProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Company Email is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.forgotPassword(email.trim());
      setIsSubmitted(true);
    } catch (err) {
      // The backend never reveals whether the email exists — a thrown
      // error here means the request itself failed (network/validation),
      // not that the account wasn't found.
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer border-none bg-transparent outline-none"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {isSubmitted ? (
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Check size={24} />
            </div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Check your inbox</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{GENERIC_MESSAGE}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full h-10 rounded-xl text-xs font-extrabold uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 transition-all cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <div className="w-11 h-11 rounded-full bg-blue-500/10 dark:bg-cyan-500/10 text-blue-600 dark:text-cyan-400 flex items-center justify-center mb-3">
              <Mail size={20} />
            </div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Forgot Password?</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4 leading-relaxed">
              Enter your Company Email and we'll send you a link to reset your password.
            </p>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/20 p-3 text-xs font-semibold text-red-600 dark:text-red-400 mb-3.5">
                <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Company Email
                </label>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="e.g. name@ifluids.com"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all duration-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 dark:focus:border-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-xl text-xs font-extrabold uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-70 cursor-pointer"
              >
                {isSubmitting ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
