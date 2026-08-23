import React, { useEffect, useRef } from "react";
import { X, Check, Archive, Trash2, AlertCircle, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { notificationService } from "./notificationService";
import type { PMONotification } from "./notificationTypes";
import { useNavigate, useLocation } from "react-router-dom";
import Portal from "../components/ui/Portal";
import { EnableNotificationsButton } from "./EnableNotificationsButton";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: PMONotification[];
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "Critical": return <AlertCircle size={18} className="text-red-500" />;
    case "Warning": return <AlertTriangle size={18} className="text-amber-500" />;
    case "Success": return <CheckCircle2 size={18} className="text-emerald-500" />;
    default: return <Info size={18} className="text-blue-500" />;
  }
};

const groupNotifications = (notifications: PMONotification[]) => {
  const today: PMONotification[] = [];
  const yesterday: PMONotification[] = [];
  const earlier: PMONotification[] = [];

  const now = new Date();
  const todayString = now.toDateString();
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayString = yesterdayDate.toDateString();

  // Filter out archived unless we want an archive view, but for now we only show unarchived
  const active = notifications.filter(n => !n.isArchived);

  // Sort descending by timestamp
  active.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  active.forEach(n => {
    const d = new Date(n.timestamp).toDateString();
    if (d === todayString) today.push(n);
    else if (d === yesterdayString) yesterday.push(n);
    else earlier.push(n);
  });

  return { today, yesterday, earlier };
};

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose, notifications }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const { today, yesterday, earlier } = groupNotifications(notifications);

  // Close drawer on route change
  useEffect(() => {
    if (isOpen) onClose();
  }, [location.pathname]);

  // Handle outside click and escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleAction = (notification: PMONotification) => {
    if (notification.actionRoute) {
      navigate(notification.actionRoute, { state: notification.actionState });
      onClose();
    }
  };

  const renderGroup = (title: string, list: PMONotification[]) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">{title}</h3>
        <div className="space-y-2">
          {list.map(n => (
            <div 
              key={n.id} 
              className={`p-3 rounded-xl border transition-colors ${
                n.isRead 
                  ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800' 
                  : 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-900 shadow-sm'
              }`}
            >
              <div className="flex gap-3">
                <div className="shrink-0 mt-0.5">
                  {getCategoryIcon(n.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className={`text-sm font-semibold truncate ${n.isRead ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                      {n.title}
                    </h4>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">
                      {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {n.message}
                  </p>
                  
                  {/* Actions Row */}
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                    {n.actionLabel && n.actionRoute && (
                      <button
                        onClick={() => handleAction(n)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {n.actionLabel}
                      </button>
                    )}
                    {!n.isRead && (
                      <button 
                        onClick={() => notificationService.markAsRead(n.id)}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <Check size={12} /> Dismiss
                      </button>
                    )}
                    <button 
                      onClick={() => notificationService.archive(n.id)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 ml-auto"
                    >
                      <Archive size={12} /> Archive
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Portal>
      {/* Drawer */}
      <div 
        ref={drawerRef}
        className={`fixed top-0 right-0 h-full w-[400px] max-w-[100vw] bg-[#F8FAFC] dark:bg-[#0B0F19] shadow-2xl z-[101] transform transition-transform duration-300 ease-in-out border-l border-slate-200 dark:border-slate-800 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Notifications</h2>
            <p className="text-xs text-slate-500 mt-0.5">Updates, alerts, and events</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Priority #6, Phase 2 — browser push opt-in. Purely additive: does
            not read/write anything the reminder engine or the local
            notification store already own. */}
        <div className="shrink-0 px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <EnableNotificationsButton />
        </div>

        {/* Action Bar */}
        <div className="shrink-0 px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex justify-between items-center">
          <button 
            onClick={() => notificationService.markAllAsRead()}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5"
          >
            <Check size={14} /> Mark all as read
          </button>
          <button 
            onClick={() => notificationService.clearRead()}
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1.5"
          >
            <Trash2 size={14} /> Clear read
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          {notifications.filter(n => !n.isArchived).length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 p-5 text-slate-400">
              <CheckCircle2 size={48} className="mb-4 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-semibold">You're all caught up!</p>
              <p className="text-xs text-slate-500 mt-1">No new notifications</p>
            </div>
          ) : (
            <div className="p-5">
              {renderGroup("Today", today)}
              {renderGroup("Yesterday", yesterday)}
              {renderGroup("Earlier", earlier)}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
};
