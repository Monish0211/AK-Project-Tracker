import { apiClient, ApiError } from "../services/apiClient";

/**
 * Priority #6, Phase 2 — browser Web Push subscription lifecycle.
 * Deliberately separate from notificationEngine.ts/notificationStore.ts
 * (the existing local, rule-derived reminder/notification system) — this
 * file only ever talks to the new backend `/notifications/push-*` API and
 * the browser's own Push API; it never reads or writes
 * localStorage["pmo_notifications"] and never touches the reminder engine.
 *
 * Permission is NEVER requested automatically — enablePushNotifications()
 * only ever runs in response to an explicit user action (see
 * EnableNotificationsButton.tsx, the sole caller).
 */

const SW_PATH = "/sw.js";
const LOCAL_SUBSCRIPTION_ID_KEY = "pmo_push_subscription_id";

export function isPushSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export type NotificationPermissionState = NotificationPermission | "unsupported";

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Registers /sw.js at most once per page load, regardless of how many
 * times this is called (module-level memoized promise) — never breaks app
 * startup if unsupported/it fails, per the Phase 2 spec's explicit
 * requirement. Safe to call unconditionally at app boot; it does nothing
 * beyond registering the worker file — no permission prompt, no
 * subscription attempt.
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) {
    return Promise.resolve(null);
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register(SW_PATH).catch((err) => {
      console.warn("PMO service worker registration failed (notifications will be unavailable):", err);
      return null;
    });
  }
  return registrationPromise;
}

function urlBase64ToUint8Array(base64Url: string): BufferSource {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

interface PushConfigResponse {
  publicKey: string | null;
  configured: boolean;
}

interface PushSubscriptionResponse {
  id: string;
  endpoint: string;
  createdAt: string;
  updatedAt: string;
}

export type EnableNotificationsResult =
  | { status: "unsupported" }
  | { status: "denied" }
  | { status: "backend-not-configured" }
  | { status: "enabled" }
  | { status: "error"; message: string };

/**
 * The one function EnableNotificationsButton.tsx calls. Requests
 * permission (browser-native prompt) only at this point — never earlier,
 * never automatically. On success, subscribes via the Push API and
 * registers the subscription with the backend (userId always implied by
 * the caller's own auth token — this file never sends one explicitly).
 */
export async function enablePushNotifications(): Promise<EnableNotificationsResult> {
  if (!isPushSupported()) {
    return { status: "unsupported" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { status: "denied" };
    }

    const registration = await registerServiceWorker();
    if (!registration) {
      return { status: "error", message: "Service worker registration failed." };
    }

    const config = await apiClient.get<PushConfigResponse>("/notifications/push-config");
    if (!config.configured || !config.publicKey) {
      return { status: "backend-not-configured" };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
    }

    const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { status: "error", message: "Browser returned an incomplete push subscription." };
    }

    const saved = await apiClient.post<PushSubscriptionResponse>("/notifications/push-subscriptions", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent,
    });

    try {
      localStorage.setItem(LOCAL_SUBSCRIPTION_ID_KEY, saved.id);
    } catch {
      // Non-fatal — the subscription is already saved server-side; only
      // disablePushNotifications()'s convenience lookup is affected.
    }

    return { status: "enabled" };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unknown error.";
    return { status: "error", message };
  }
}

/** Best-effort, symmetrical undo of enablePushNotifications() — unsubscribes locally and removes the backend record if we know its id. */
export async function disablePushNotifications(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await registerServiceWorker();
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  await subscription?.unsubscribe().catch(() => {});

  try {
    const id = localStorage.getItem(LOCAL_SUBSCRIPTION_ID_KEY);
    if (id) {
      await apiClient.delete(`/notifications/push-subscriptions/${id}`).catch(() => {});
      localStorage.removeItem(LOCAL_SUBSCRIPTION_ID_KEY);
    }
  } catch {
    // Best-effort cleanup only.
  }
}
