import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async controller so a rejected promise (thrown AppError, Prisma
 * error, anything) is forwarded to Express's `next()` instead of becoming an
 * unhandled rejection. Every controller in every module uses this — it's
 * the one place that boilerplate lives, instead of a repeated try/catch in
 * each handler.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
