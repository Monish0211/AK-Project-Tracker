import { X, HelpCircle, Mail, Globe, Info } from "lucide-react";
import Portal from "../../ui/Portal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpDialog = ({ isOpen, onClose }: Props) => {
  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
      
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-200 scale-100 p-6 mx-4">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <HelpCircle className="text-blue-600 dark:text-blue-400" size={20} />
            <h3 className="text-lg font-bold text-slate-800">
              Help & Information
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-350 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-5 space-y-5">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800">PMO Portal Support</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              For technical support or issues importing timesheet files, contact the support team:
            </p>
          </div>

          <div className="space-y-3.5">
            {/* Version */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-gray-100 dark:border-slate-850">
                <Info size={16} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Application Version</p>
                <p className="text-xs font-semibold text-slate-800">iFluids PMO Portal v2.1.0-prod</p>
              </div>
            </div>

            {/* Support Email */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-gray-100 dark:border-slate-850">
                <Mail size={16} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Support Email</p>
                <a href="mailto:support@ifluids.com" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  support@ifluids.com
                </a>
              </div>
            </div>

            {/* Documentation */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-gray-100 dark:border-slate-850">
                <Globe size={16} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Documentation</p>
                <a href="https://docs.ifluids.com" target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  docs.ifluids.com
                </a>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-slate-700/60 text-[11px] text-slate-450 dark:text-slate-500 leading-relaxed">
            &copy; {new Date().getFullYear()} iFluids Engineering. All rights reserved. Managed by System Administrator.
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-gray-200 dark:border-slate-750 gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-805 transition"
          >
            Close
          </button>
        </div>

      </div>
      </div>
    </Portal>
  );
};
export default HelpDialog;
