import { X, LogOut } from "lucide-react";
import Portal from "../../ui/Portal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const LogoutDialog = ({ isOpen, onClose, onConfirm }: Props) => {
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
      <div className="relative w-full max-w-sm bg-white dark:bg-[#1E293B] border border-gray-250 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-200 scale-100 p-6 mx-4">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <LogOut className="text-red-500" size={20} />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Sign Out
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-350 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-6">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
            Are you sure you want to sign out of the PMO Portal?
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-slate-700 gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 dark:border-slate-750 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition cursor-pointer"
          >
            Cancel
          </button>
          
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md transition cursor-pointer"
          >
            Sign Out
          </button>
        </div>

      </div>
      </div>
    </Portal>
  );
};
export default LogoutDialog;
