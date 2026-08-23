import webpush from "web-push";
import { env } from "../../shared/utils/env.js";

/**
 * Thin wrapper around the standard `web-push` library (VAPID) — no
 * OneSignal/Firebase/FCM SDK, no external vendor, per the approved Priority
 * #6 Phase 1 design. Optional infrastructure, same "app boots fine blank,
 * this feature simply refuses to run until configured" treatment as
 * Graph/KEKA (graphAuth.service.ts) and Claude (env.ts) — every send path
 * checks isWebPushConfigured() first.
 */

let configured = false;

export function isWebPushConfigured(): boolean {
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

function ensureConfigured(): void {
  if (!isWebPushConfigured()) return;
  if (configured) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** Safe to expose to the frontend — the public key is not a secret (only VAPID_PRIVATE_KEY is). Returns null when unconfigured. */
export function getPublicVapidKey(): string | null {
  return env.VAPID_PUBLIC_KEY ?? null;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushSendOutcome = { ok: true } | { ok: false; expired: boolean; error: string };

/**
 * Sends one push message to one subscription. Never throws — a dead
 * endpoint (404/410) is reported as `expired: true` so the caller
 * (notification.service.ts) can revoke just that one row; any other
 * failure is reported as `expired: false` so a transient error never
 * causes a live subscription to be revoked. isWebPushConfigured() must be
 * checked by the caller before looping subscriptions — this function
 * itself throws if called while unconfigured, since that indicates a
 * caller bug, not a runtime/network condition.
 */
export async function sendPushNotification(target: PushTarget, payload: unknown): Promise<PushSendOutcome> {
  if (!isWebPushConfigured()) {
    throw new Error("Web Push is not configured (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT).");
  }
  ensureConfigured();

  try {
    await webpush.sendNotification(target, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const expired = statusCode === 404 || statusCode === 410;
    const message = err instanceof Error ? err.message : "Unknown push delivery error.";
    return { ok: false, expired, error: message };
  }
}
