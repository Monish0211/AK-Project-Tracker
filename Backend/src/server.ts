import app from "./app.js";
import { env } from "./shared/utils/env.js";
import { verifyEmailConnection } from "./shared/email/transporter.js";
import { startTimesheetPollScheduler } from "./shared/scheduler/timesheetPollScheduler.js";

app.listen(env.PORT, () => {
  console.log(`PMO Portal backend listening on port ${env.PORT} [${env.NODE_ENV}]`);
  // P2-12 — pure observability, no behavior change: CORS_ALLOWED_ORIGIN
  // staying unset is the existing, deliberate, already-documented default
  // (see app.ts's own comment for why — this API is Bearer-token
  // authenticated, not cookie-based, so wildcard CORS doesn't carry the
  // classic cookie-CSRF risk that default would otherwise pose). This only
  // makes the "you should still set it once the real production frontend
  // origin is confirmed" expectation visible in production logs instead of
  // relying solely on someone having read .env.example — it never fires in
  // local development (NODE_ENV defaults to "development") and never
  // changes what app.use(cors(...)) actually does.
  if (env.NODE_ENV === "production" && !env.CORS_ALLOWED_ORIGIN) {
    console.warn(
      "[Startup] CORS_ALLOWED_ORIGIN is not set in production — every origin is currently allowed to call this API. " +
        "Set it to the real production frontend origin once confirmed (see .env.example)."
    );
  }
  // Fire-and-forget: verifyEmailConnection() never throws, and email is
  // optional infrastructure — a slow/unreachable mail server must never
  // delay or block the HTTP server coming up.
  void verifyEmailConnection();
  // Registers the daily 22:00 Asia/Kolkata KEKA-poll trigger — see
  // shared/scheduler/timesheetPollScheduler.ts. Started here (not at module
  // load) so its loopback HTTP call always has a listening server to reach.
  startTimesheetPollScheduler();
});
