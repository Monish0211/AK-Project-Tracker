import { X, User, Briefcase, Mail, Phone, MapPin, Hash } from "lucide-react";
import type { UserProfile } from "../../../types/UserProfile";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
}

export const MyProfileModal = ({ isOpen, onClose, profile }: Props) => {
  if (!isOpen) return null;

  return (
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
            <h3 className="text-lg font-bold text-slate-800">
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
            {/* Profile Avatar Grid */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xl font-bold shrink-0 shadow-md">
              {profile.fullName.split(" ").map(n => n[0]).join("")}
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-800">
                {profile.fullName}
              </h4>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                {profile.role}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Emp ID */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                <Hash size={16} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Employee ID
                </p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {profile.employeeId}
                </p>
              </div>
            </div>

            {/* Department */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                <Briefcase size={16} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Department
                </p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {profile.department}
                </p>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                <Mail size={16} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Email Address
                </p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5 break-all">
                  {profile.email}
                </p>
              </div>
            </div>

            {/* Phone */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                <Phone size={16} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Phone Number
                </p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {profile.phone}
                </p>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-3 sm:col-span-2">
              <div className="mt-0.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                <MapPin size={16} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Work Location
                </p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {profile.location}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-slate-700 gap-3">
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
export default MyProfileModal;
