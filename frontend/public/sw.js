/**
 * PMO Portal Service Worker — Priority #6, Phase 2 (notification
 * infrastructure only). Deliberately contains NO application/business
 * logic — its only two jobs are: (1) turn an incoming Web Push message into
 * a visible browser notification, and (2) route a click on that
 * notification back into the PMO app at a safe, pre-validated URL. Every
 * actionUrl this ever receives was already produced server-side from a
 * fixed entityType allowlist (see Backend's notification.service.ts) —
 * this file never trusts or opens anything else.
 *
 * Not a full offline/PWA service worker — no fetch/cache handling of any
 * kind. That is explicitly out of scope for this phase (see the Phase 1
 * audit's "no Windows app, no PWA install flow this phase").
 */

const DEFAULT_TITLE = "iFluids PMO";
// Branding fix: was "/favicon.svg" — Chrome's Notifications API does not
// reliably render SVG icons (no raster rendering path for showNotification's
// icon/badge options), which is why every push notification was silently
// falling back to a generic Chrome icon regardless of this value. Fixed
// paths only, never accepted from the push payload (see the push handler
// below) — the same "never trust external input for anything that resolves
// to a resource" rule already applied to actionUrl.
const DEFAULT_ICON = "/icons/pmo-192.png";
const DEFAULT_BADGE = "/icons/pmo-badge.png";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push with a non-JSON or missing body still deserves a generic
    // notification rather than being silently dropped.
    payload = {};
  }

  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title : DEFAULT_TITLE;
  const body = typeof payload.body === "string" ? payload.body : "";
  // actionUrl is only ever trusted as a same-origin relative path — never an
  // absolute/external URL — even though the backend already only ever
  // produces one from its own fixed allowlist. This is a second,
  // independent guard at the very last point before anything is stored for
  // notificationclick to act on.
  const actionUrl =
    typeof payload.actionUrl === "string" && payload.actionUrl.startsWith("/") ? payload.actionUrl : null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: DEFAULT_ICON,
      badge: DEFAULT_BADGE,
      data: { actionUrl },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const actionUrl = event.notification.data && event.notification.data.actionUrl;
  const targetPath = typeof actionUrl === "string" && actionUrl.startsWith("/") ? actionUrl : "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      for (const client of windows) {
        // Same-origin check only — this worker is scoped to its own origin
        // regardless, but being explicit here costs nothing.
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetPath);
            } catch {
              // Some browsers don't support WindowClient.navigate — the
              // focused tab staying on its current page is an acceptable
              // degradation, never a hard failure.
            }
          }
          return;
        }
      }

      await self.clients.openWindow(targetPath);
    })()
  );
});
