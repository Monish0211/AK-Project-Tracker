import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";
import type { ApiErrorResponse } from "../types/apiResponse.types.js";

/**
 * Single place every error in the app funnels through. An AppError's
 * message/statusCode is trusted and shown to the client as-is; anything
 * else (programming errors, Prisma errors, etc.) is logged server-side but
 * only ever reported to the client as a generic 500 — internals must never
 * leak in a response body.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: ApiErrorResponse = { success: false, message: err.message };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const body: ApiErrorResponse = { success: false, message: "A record with these details already exists." };
    res.status(409).json(body);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
    const body: ApiErrorResponse = { success: false, message: "One of the referenced records does not exist." };
    res.status(400).json(body);
    return;
  }

  console.error("Unhandled error:", err);
  const body: ApiErrorResponse = { success: false, message: "Something went wrong. Please try again." };
  res.status(500).json(body);
}
