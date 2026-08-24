import { ApiError } from "../services/apiClient";

/**
 * Turns any caught error into a message safe to show a normal user in a
 * PmoToast. The backend already returns clean, human-written messages on
 * every ApiError (see Backend/src/shared/utils/AppError.ts and its
 * consistent use across every controller/service this app has ever had
 * audited) — it never leaks raw SQL/Prisma text, stack traces, or file
 * paths to the client. So an ApiError's own message is safe to display
 * as-is. Anything else (a network failure, a thrown non-ApiError
 * exception, a bug) falls back to a generic, non-technical message instead
 * of ever showing a raw `Error.message`/stack to the user.
 */
export function getUserFriendlyErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return fallback;
}
