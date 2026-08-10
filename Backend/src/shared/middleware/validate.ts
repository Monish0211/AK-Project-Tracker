import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../utils/AppError.js";

/**
 * Generic body-validation middleware for zod schemas — every module's
 * `validators/` folder exports a schema and reuses this instead of hand-
 * rolling per-route validation. On success, `req.body` is replaced with the
 * parsed (typed, defaulted) value.
 */
export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid request body.";
      throw new AppError(message, 400);
    }

    req.body = result.data;
    next();
  };
}
