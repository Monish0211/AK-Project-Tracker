import { useEffect, useState } from "react";
import { toastStore, TOAST_CHANGED_EVENT, type ReminderToastData } from "./toastStore";

export const useToasts = (): ReminderToastData[] => {
  const [toasts, setToasts] = useState<ReminderToastData[]>(() => toastStore.getAll());

  useEffect(() => {
    const sync = () => setToasts(toastStore.getAll());
    sync(); // initial load
    window.addEventListener(TOAST_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TOAST_CHANGED_EVENT, sync);
  }, []);

  return toasts;
};
