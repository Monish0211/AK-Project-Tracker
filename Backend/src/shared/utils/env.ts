import "dotenv/config";
import { z } from "zod";

/**
 * z.coerce.boolean() is a footgun for env vars: Boolean("false") is `true`
 * (any non-empty string is truthy), so SMTP_SECURE=false would silently
 * coerce to true. This treats only the literal string "true" as true.
 */
export const booleanFromEnv = z
  .string()
  .optional()
  .transform((value) => value === "true");

/**
 * Trims first, then treats "" the same as unset. Two real problems this
 * fixes: an unset-but-present env var (SMTP_HOST=) arrives here as "", not
 * undefined, and "" still satisfies `.optional()` while failing a format
 * check like `.email()` — exactly how an intentionally-blank SMTP_FROM_EMAIL
 * crashed startup during testing. Separately, `SMTP_USER= noreply@...` (a
 * stray leading space after `=`) would otherwise be used as the literal
 * SMTP auth username, including that space, and silently fail to
 * authenticate. Every optional SMTP string field below goes through this.
 */
const optionalTrimmedString = (schema: z.ZodString) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    schema.optional()
  );

/**
 * Single source of truth for every environment variable this backend reads.
 * Validated once at startup (via zod) so a missing/malformed value fails
 * fast and loudly here, instead of surfacing later as a confusing runtime
 * error deep inside some unrelated request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
  JWT_EXPIRES_IN: z.string().default("8h"),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TOKEN_EXPIRY_MINUTES: z.coerce.number().int().positive().default(30),
  PASSWORD_EXPIRY_DAYS: z.coerce.number().int().positive().default(90),
  MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Email is optional infrastructure, not a hard dependency of the app —
  // deliberately NOT `.min(1)`/required, so a backend with no mail server
  // configured yet still boots and Auth/Users keep working. See
  // shared/email/transporter.ts for what "configured" means and how a
  // missing value here is handled at the point email is actually sent.
  SMTP_HOST: optionalTrimmedString(z.string()),
  SMTP_PORT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().positive().optional()
  ),
  SMTP_SECURE: booleanFromEnv,
  SMTP_USER: optionalTrimmedString(z.string()),
  SMTP_PASS: optionalTrimmedString(z.string()),
  SMTP_FROM_NAME: z.string().default("iFluids Engineering PMO Portal"),
  SMTP_FROM_EMAIL: optionalTrimmedString(z.string().email("SMTP_FROM_EMAIL must be a valid email address")),

  FRONTEND_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url("FRONTEND_URL must be a valid URL").default("http://localhost:5173")
  ),

  // Microsoft Graph / KEKA — Phase 3.8. All optional, same treatment as
  // SMTP above: the app boots fine with these blank, and mailPoll.service.ts
  // simply refuses to run (logging why) until every one of them is filled
  // in. Never hardcode any of these — the real values are entered directly
  // into .env, never committed, never placed in TypeScript source. The
  // subject pattern in particular is deliberately just a plain string
  // (matched as a case-insensitive substring, see mailPoll.service.ts) —
  // the real KEKA subject line is not yet confirmed, so this must stay
  // configurable rather than guessed.
  MICROSOFT_TENANT_ID: optionalTrimmedString(z.string()),
  MICROSOFT_CLIENT_ID: optionalTrimmedString(z.string()),
  MICROSOFT_CLIENT_SECRET: optionalTrimmedString(z.string()),
  KEKA_MAILBOX: optionalTrimmedString(z.string()),
  KEKA_SENDER_EMAIL: optionalTrimmedString(z.string()),
  KEKA_SUBJECT_PATTERN: optionalTrimmedString(z.string()),
  KEKA_ATTACHMENT_NAME: optionalTrimmedString(z.string()),

  // How many days back the mailbox poll looks for candidate KEKA emails —
  // deliberately generous (not just "today"), since Decision 9 confirms an
  // email can legitimately be late, and a missed poll cycle must not mean a
  // permanently-missed email (see mailPoll.service.ts).
  KEKA_POLL_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),

  // Protects POST /internal/timesheets/poll — a shared-secret header check,
  // not a JWT-user route, since a cron/scheduler process has no logged-in
  // user context. Optional like the rest of this section; the route
  // rejects every request with a clear 503 until this is set (see
  // verifyInternalSecret.ts) rather than silently accepting an unprotected
  // call.
  INTERNAL_POLL_SECRET: optionalTrimmedString(z.string()),

  // Anthropic Claude — PDF Import AI-assist supplement (Stage 4, PDF Import
  // feature). Same optional/fail-closed treatment as Graph/KEKA above: the
  // app boots fine with these blank, and the pdfImport module's
  // isClaudeConfigured() simply refuses to run (503) until ANTHROPIC_API_KEY
  // is set. Never hardcode this key anywhere in source — Backend/.env only.
  // NOTE: this is read once at process startup (see the module-level parse
  // below) — changing it in .env requires a backend restart to take effect,
  // there is no hot-reload.
  ANTHROPIC_API_KEY: optionalTrimmedString(z.string()),
  CLAUDE_MODEL: optionalTrimmedString(z.string()),
  CLAUDE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  PDF_IMPORT_AI_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(20),

  // Multi-document cross-verification (document sets — e.g. Quotation +
  // LOA for one project) sends every uploaded PDF to Claude in a SINGLE
  // request as multiple `document` content blocks, so these two bound that
  // one request independently of PDF_IMPORT_AI_MAX_FILE_SIZE_MB above
  // (which only ever bounded one file). Base64 inflates raw bytes by ~37%,
  // and the Anthropic API's own request-size ceiling is a hard external
  // limit this app doesn't control — 20MB combined keeps even a worst-case
  // multi-file set comfortably under it. 10 documents is a deliberately
  // conservative cap on a realistic "one project's document package"
  // (typically 2-5 files); exceeding either cap skips the Claude leg for
  // the WHOLE set (never partially) and falls back to the OCR/rule-engine
  // consolidated result, mirroring the existing per-file Claude-fallback
  // behavior at the document-set level.
  PDF_IMPORT_AI_MAX_DOCUMENT_SET_MB: z.coerce.number().int().positive().default(20),
  PDF_IMPORT_AI_MAX_DOCUMENTS_PER_SET: z.coerce.number().int().positive().default(10),

  // Priority #6 — Web Push VAPID key pair. Optional, same "app boots fine
  // blank, the feature just refuses to run until configured" treatment as
  // Graph/KEKA and Claude above — webPush.service.ts's isWebPushConfigured()
  // is the single gate every push-send path checks. VAPID_PUBLIC_KEY is safe
  // to return to the frontend (it's not a secret, only the private key is);
  // never hardcode either in source, .env only.
  VAPID_PUBLIC_KEY: optionalTrimmedString(z.string()),
  VAPID_PRIVATE_KEY: optionalTrimmedString(z.string()),
  VAPID_SUBJECT: optionalTrimmedString(z.string()),

  // Deliberately OPT-IN, not a default-on restriction: app.ts's cors()
  // currently allows every origin. Restricting that by default here would
  // risk locking the real production frontend out entirely if this value
  // were ever wrong/stale/unset on the server — a far worse failure mode
  // than the modest security benefit of tightening it (this app uses
  // Bearer-token auth, not cookies, so wildcard CORS doesn't carry the
  // classic cookie-CSRF risk). Only set this in production once the real
  // frontend origin is confirmed; leave unset to keep today's exact
  // behavior (every origin allowed) unchanged.
  CORS_ALLOWED_ORIGIN: optionalTrimmedString(z.string()),

  // Local Sentry evaluation only (see instrument.ts). Unset in any
  // environment means Sentry is a no-op — never a startup failure.
  SENTRY_DSN: optionalTrimmedString(z.string()),

  // Documents feature — Sep 2026. Private filesystem location for uploaded
  // Project/PR Request documents — deliberately OUTSIDE the frontend's
  // htdocs/static root in every environment (see documentStorage.ts).
  // Defaults to a repo-relative folder so local development works with zero
  // .env setup; production sets this to
  // /home/ifluids-pmodashboard/storage/documents (a sibling of htdocs/, not
  // under it — confirmed outside every Nginx location/root/alias mapping).
  DOCUMENT_STORAGE_PATH: z.string().default("./storage/documents"),

  // Deliberately NOT a business file-size restriction — the business
  // requirement is "no arbitrary limit" (invoices/drawings can legitimately
  // be large). This exists only to fail fast with a clean application error
  // instead of letting the request hang until Nginx's own
  // client_max_body_size (64M, set globally in nginx.conf, confirmed via a
  // read-only production check) rejects it with a raw 413. Keep this at or
  // below that production ceiling; raising it without also raising Nginx's
  // setting would just move the failure point, not remove it.
  DOCUMENT_UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(64),

  // Request Invoice attachments (Oct 2026) — the largest whole email (after MIME/base64 encoding, which grows files by ~37%)
  // this app will hand to the SMTP server when a request carries attachments. NOT a verified provider limit: no SMTP provider or
  // limit is documented in this repo, and the real one can only be confirmed with whoever runs the mailbox. 20 is deliberately
  // below the 25 MB that common providers and recipient mailboxes enforce, leaving headroom. A request whose files do not fit is
  // still saved (files kept), and its notification email says plainly that they could not be attached. Raise this ONLY after
  // confirming the real limit. Upload limits themselves (5 files / 10 MB each / 20 MB total) are fixed in
  // invoiceRequestAttachments.rules.ts.
  INVOICE_REQUEST_EMAIL_MAX_MB: z.coerce.number().positive().default(20),

  // Customer GST Document Import/Extraction (Sep 2026) — a single GST
  // registration certificate is a tiny document (1-2 pages), nowhere near
  // the general Documents ceiling above; a dedicated, smaller default keeps
  // this feature's own failure mode ("file too large") distinct from the
  // general Documents feature's. Same "app boots fine unconfigured" Claude
  // gate as PDF Import — see customerGst's own claude extraction service.
  GST_DOCUMENT_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),

  // PMO Coordinator Management (Oct 2026) — allocation email switch ("PMO
  // Project Assigned to You", sent to the newly linked coordinator account).
  // Fail-safe default false (unset/"" / anything but "true"), same
  // booleanFromEnv treatment as SMTP_SECURE above. SMTP must also be
  // configured for a real send.
  PMO_ALLOCATION_EMAIL_ENABLED: booleanFromEnv,

  // Weekly "Projects Missing Other Project Expenses" email (Oct 2026).
  // - ..._EMAIL_ENABLED: real delivery switch; fail-safe default false. When
  //   false the weekly check still runs and is recorded, but nothing is sent.
  // - ..._MANUAL_TRIGGER_ENABLED: allows Administrators/PMO Managers to run
  //   the job on demand (Settings → Weekly Emails). Default false, so it is
  //   unavailable in production unless explicitly enabled.
  // - ..._CRON / APP_TIMEZONE: weekly schedule (default Monday 09:00) and the
  //   IANA timezone used for the schedule, the week key and report dates.
  MISSING_EXPENSE_EMAIL_ENABLED: booleanFromEnv,
  MISSING_EXPENSE_MANUAL_TRIGGER_ENABLED: booleanFromEnv,
  MISSING_EXPENSE_CRON: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined),
    z.string().default("0 9 * * 1")
  ),
  // Weekly "Invoices Unpaid for 30+ Days" email (Oct 2026) — independent
  // switches from the Other Project Expenses email, same fail-safe default
  // false. Schedule defaults to Monday 11:00 in APP_TIMEZONE.
  UNPAID_INVOICE_EMAIL_ENABLED: booleanFromEnv,
  UNPAID_INVOICE_MANUAL_TRIGGER_ENABLED: booleanFromEnv,
  UNPAID_INVOICE_CRON: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined),
    z.string().default("0 11 * * 1")
  ),
  APP_TIMEZONE: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined),
    z
      .string()
      .default("Asia/Kolkata")
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, "APP_TIMEZONE must be a valid IANA timezone, e.g. Asia/Kolkata")
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables — check your .env file against .env.example.");
}

export const env = parsed.data;
