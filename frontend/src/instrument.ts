import * as Sentry from "@sentry/react";

/**
 * Local Sentry evaluation only. Must be imported before anything else in
 * main.tsx so React error/render instrumentation is attached before the app
 * renders. VITE_SENTRY_DSN unset (any environment, including every
 * deployment until this is deliberately turned on) means this is a total
 * no-op — Sentry.init() is never called, matching the same
 * "missing env var never breaks the app" convention as the rest of this
 * frontend's optional config.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // Conservative — this is an evaluation, not a decision to trace every
    // request. Session Replay, Feedback, and Profiling are deliberately not
    // enabled here (see the Sentry audit/rollout conversation).
    tracesSampleRate: 0.1,
  });
}
