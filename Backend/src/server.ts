import app from "./app.js";
import { env } from "./shared/utils/env.js";
import { verifyEmailConnection } from "./shared/email/transporter.js";

app.listen(env.PORT, () => {
  console.log(`PMO Portal backend listening on port ${env.PORT} [${env.NODE_ENV}]`);
  // Fire-and-forget: verifyEmailConnection() never throws, and email is
  // optional infrastructure — a slow/unreachable mail server must never
  // delay or block the HTTP server coming up.
  void verifyEmailConnection();
});
