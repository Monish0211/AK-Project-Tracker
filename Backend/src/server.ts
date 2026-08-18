import app from "./app.js";
import { env } from "./shared/utils/env.js";
import { verifyEmailConnection } from "./shared/email/transporter.js";
import { startTimesheetPollScheduler } from "./shared/scheduler/timesheetPollScheduler.js";

app.listen(env.PORT, () => {
  console.log(`PMO Portal backend listening on port ${env.PORT} [${env.NODE_ENV}]`);
  // Fire-and-forget: verifyEmailConnection() never throws, and email is
  // optional infrastructure — a slow/unreachable mail server must never
  // delay or block the HTTP server coming up.
  void verifyEmailConnection();
  // Registers the daily 22:00 Asia/Kolkata KEKA-poll trigger — see
  // shared/scheduler/timesheetPollScheduler.ts. Started here (not at module
  // load) so its loopback HTTP call always has a listening server to reach.
  startTimesheetPollScheduler();
});
