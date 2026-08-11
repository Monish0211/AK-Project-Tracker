import { X, User, Briefcase, Mail, Phone, Hash, Shield, Users, Clock, KeyRound, IdCard } from "lucide-react";
import type { UserSession } from "../../../auth/authService";
import Portal from "../../ui/Portal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: UserSession | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface FieldProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}

function Field({ icon, label, value, wide }: FieldProps) {
  return (
    <div className={`flex items-start gap-3 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="mt-0.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}

/** Real profile data from AuthContext (loaded from GET /auth/me) — no mock/demo profile involved. */
export const MyProfileModal = ({ isOpen, onClose, user }: Props) => {
  if (!isOpen || !user) return null;

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-200 scale-100 p-6 mx-4">

        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <User className="text-blue-600 dark:text-blue-400" size={20} />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              My Profile
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-650 dark:hover:text-slate-300 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-6 space-y-6">
          <div className="flex items-center gap-4 pb-4 border-b border-gray-100 dark:border-slate-700/60">
            {/* Profile Avatar — initials, no photo upload exists yet */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xl font-bold shrink-0 shadow-md">
              {initials}
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {user.name}
              </h4>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                {user.role}
              </p>
              <span
                className={`inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-bold uppercase tracking-wide ${
                  user.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-red-500"}`} />
                {user.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field icon={<Hash size={16} />} label="Employee Code" value={user.employeeId || "—"} />
            <Field icon={<Briefcase size={16} />} label="Department" value={user.department || "—"} />
            <Field icon={<Mail size={16} />} label="Company Email" value={user.email} wide />
            <Field icon={<Phone size={16} />} label="Phone Number" value={user.phoneNumber || "—"} />
            <Field icon={<IdCard size={16} />} label="Designation" value={user.designation || "—"} />
            <Field icon={<Users size={16} />} label="Reporting Manager" value={user.reportingManagerName || "—"} />
            <Field icon={<Shield size={16} />} label="Role" value={user.role} />
            <Field icon={<IdCard size={16} />} label="Employee Type" value={user.employeeType || "—"} />
            <Field icon={<Clock size={16} />} label="Last Login" value={formatDateTime(user.lastLogin)} />
            <Field icon={<KeyRound size={16} />} label="Password Last Reset" value={formatDateTime(user.passwordResetAt)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-slate-700 gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition"
          >
            Close
          </button>
        </div>

      </div>
      </div>
    </Portal>
  );
};
export default MyProfileModal;
