import React from "react";
import { useToasts } from "./useToasts";
import { toastStore } from "./toastStore";
import { ReminderToast } from "./ReminderToast";

/**
 * Mounted once at the app shell level (see MainLayout). Renders every active
 * reminder toast stacked bottom-right, newest closest to the corner. Purely
 * a view over toastStore — dismissing here never touches the reminder or its
 * Notification Bell entry (that's the permanent history, untouched).
 */
export const ReminderToastContainer: React.FC = () => {
  const toasts = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col-reverse gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ReminderToast toast={toast} onDismiss={toastStore.dismiss.bind(toastStore)} />
        </div>
      ))}
    </div>
  );
};
