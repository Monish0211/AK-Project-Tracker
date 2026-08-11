import "dotenv/config";
import { z } from "zod";

/**
 * z.coerce.boolean() is a footgun for env vars: Boolean("false") is `true`
 * (any non-empty string is truthy), so SMTP_SECURE=false would silently
 * coerce to true. This treats only the literal string "true" as true.
 */
const booleanFromEnv = z
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables — check your .env file against .env.example.");
}

export const env = parsed.data;
