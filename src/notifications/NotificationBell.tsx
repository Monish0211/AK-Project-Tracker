import React, { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "./useNotifications";
import { NotificationDrawer } from "./NotificationDrawer";

export const NotificationBell: React.FC = () => {
  const { notifications, unreadCount } = useNotifications();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsDrawerOpen(true)}
        className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition duration-150 cursor-pointer outline-none border-none bg-transparent"
        title="Notifications"
      >
        <div className="relative flex items-center justify-center">
          <Bell size={18} className="text-slate-500 dark:text-slate-400" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-white dark:border-slate-900"></span>
            </span>
          )}
        </div>
        <span className="hidden md:inline">Notifications</span>
        {unreadCount > 0 && (
          <span className="bg-blue-600 dark:bg-blue-500 text-white rounded-full text-[10px] w-4.5 h-4.5 flex items-center justify-center font-bold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        notifications={notifications} 
      />
    </>
  );
};
