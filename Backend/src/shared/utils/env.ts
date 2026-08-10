import "dotenv/config";
import { z } from "zod";

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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables — check your .env file against .env.example.");
}

export const env = parsed.data;
