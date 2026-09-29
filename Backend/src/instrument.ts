import * as Sentry from "@sentry/node";
import { env } from "./shared/utils/env.js";

/**
 * Local Sentry evaluation only. Must be the very first import in
 * server.ts — before app.ts and anything it imports — so Sentry's
 * auto-instrumentation attaches before Express/http are used.
 * SENTRY_DSN unset (any environment, including every deployment until this
 * is deliberately turned on) means this is a total no-op, matching the same
 * "missing env var never breaks the app" convention env.ts already uses
 * everywhere else (CORS_ALLOWED_ORIGIN, VAPID keys, etc.).
 */
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Conservative — this is an evaluation, not a decision to trace every
    // request. Profiling/Logging/Application Metrics are deliberately not
    // enabled here (see the Sentry audit/rollout conversation).
    tracesSampleRate: 0.1,
  });
}
