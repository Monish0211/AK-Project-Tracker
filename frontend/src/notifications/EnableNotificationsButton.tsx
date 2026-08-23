import React, { useEffect, useState } from "react";
import { BellRing, BellOff, Check } from "lucide-react";
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermissionState,
  isPushSupported,
} from "./pushSubscriptionService";

/**
 * Priority #6, Phase 2 — the one explicit user action that requests browser
 * notification permission. Never auto-prompts (see App-level: nothing else
 * in this app calls Notification.requestPermission()). Intentionally small
 * and self-contained so it can be dropped into NotificationDrawer.tsx with
 * a minimal, additive change rather than a redesign.
 */
export const EnableNotificationsButton: React.FC = () => {
  const [permission, setPermission] = useState(getNotificationPermissionState());
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPermission(getNotificationPermissionState());
  }, []);

  if (!isPushSupported()) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
        Browser notifications aren't supported in this browser.
      </p>
    );
  }

  if (permission === "granted") {
    return (
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Check size={13} /> PMO notifications enabled
        </span>
        <button
          type="button"
          onClick={async () => {
            setIsBusy(true);
            await disablePushNotifications();
            setIsBusy(false);
            // Browser permission itself can only be revoked by the user via
            // browser settings — this only stops PMO from pushing to this
            // subscription; `permission` intentionally stays "granted".
          }}
          disabled={isBusy}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <BellOff size={12} /> Disable
        </button>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400 px-1">
        Notifications are blocked for this site — enable them from your browser's site settings to receive PMO alerts.
      </p>
    );
  }

  return (
    <div className="px-1">
      <button
        type="button"
        onClick={async () => {
          setIsBusy(true);
          setError(null);
          const result = await enablePushNotifications();
          setIsBusy(false);
          setPermission(getNotificationPermissionState());
          if (result.status === "error") setError(result.message);
          else if (result.status === "backend-not-configured") {
            setError("Push notifications aren't configured on the server yet.");
          }
        }}
        disabled={isBusy}
        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
      >
        <BellRing size={13} /> {isBusy ? "Enabling…" : "Enable PMO Notifications"}
      </button>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
};
