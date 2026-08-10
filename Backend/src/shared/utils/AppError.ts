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

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
