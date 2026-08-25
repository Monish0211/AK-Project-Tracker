import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../utils/env.js";

/**
 * P2-08 (production observability hardening) — minimal structured request
 * logging. Deliberately NOT a rewrite of every log call in the app, and
 * deliberately NOT a new dependency (no morgan/pino/winston) — a
 * few-line middleware covering the concrete gap that existed: no request
 * correlation, no per-request method/route/status/duration visibility at
 * all before this (confirmed — app.ts had zero logging middleware).
 *
 * Logs, per request, on response finish (so status/duration are real, not
 * guessed): timestamp, requestId, method, route, status, durationMs, and
 * the authenticated user's id (req.user?.sub) IF the request reached
 * `authenticate` — never anything from headers or the request body, so
 * there is no separate redaction list to maintain: passwords, JWTs,
 * refresh/reset tokens, the Authorization header, and financial payloads
 * are simply never in scope for what this logger reads.
 *
 * /health is skipped entirely — a liveness/readiness probe hitting it
 * every few seconds must never flood production logs.
 *
 * JSON in production (env.NODE_ENV === "production", for log-aggregator
 * ingestion); a single readable line in development. Errors already retain
 * their stack traces via errorHandler.ts's own console.error() — this
 * middleware only adds the requestId to req so errorHandler.ts can
 * correlate an error line with the request line that produced it.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.path === "/health") {
    next();
    return;
  }

  // A caller-supplied x-request-id is honored (e.g. the Keka poll
  // scheduler's own loopback call sets one — see
  // timesheetPollScheduler.ts — so a background job's HTTP request is
  // identifiable in these logs even though it's application-local, not a
  // real reverse-proxy-assigned id) — otherwise generate one.
  const requestId = (req.headers["x-request-id"] as string | undefined)?.trim() || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const entry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      route: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: req.user?.sub ?? null,
      environment: env.NODE_ENV,
    };

    if (env.NODE_ENV === "production") {
      console.log(JSON.stringify(entry));
    } else {
      console.log(
        `[${entry.timestamp}] ${entry.method} ${entry.route} ${entry.status} ${entry.durationMs}ms` +
          `${entry.userId ? ` user=${entry.userId}` : ""} req=${entry.requestId}`
      );
    }
  });

  next();
}
