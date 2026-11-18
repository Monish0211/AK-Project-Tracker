/**
 * The one error type application code should ever throw deliberately.
 * `errorHandler.ts` treats an AppError as "operational" (safe message to
 * show the client, known status code); anything else (a raw Error/
 * TypeError/Prisma error) is treated as unexpected and mapped to a generic
 * 500 so internals are never leaked to the client.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  /** Optional structured, client-safe detail (e.g. the per-row problems of a rejected import). Never put internals here. */
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    if (details !== undefined) this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
