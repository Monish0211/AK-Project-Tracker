import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer from "multer";
import { AppError } from "../../shared/utils/AppError.js";
import { INVOICE_REQUEST_ATTACHMENT_LIMITS } from "./invoiceRequestAttachments.rules.js";

/**
 * Request Invoice attachments (Oct 2026) — upload handling for POST /projects/:projectId/invoice-requests ONLY. Nothing here is
 * shared with, or changes, any other upload route or the global error handler (which has no Multer branch — an over-size file
 * elsewhere still becomes a generic 500; here it becomes a clear 413).
 *
 * Two request shapes reach the route:
 *  - application/json  — the request as it always was. express.json() has already parsed it; this middleware does nothing.
 *  - multipart/form-data — a "payload" field holding that same JSON, plus up to 5 "files". Parsed here, then the JSON is put back
 *    on req.body so the existing zod validation and service see exactly what they always saw.
 */

const MB = 1024 * 1024;
const { maxFiles, maxFileBytes, maxTotalBytes } = INVOICE_REQUEST_ATTACHMENT_LIMITS;

const totalByRequest = new WeakMap<Request, number>();

/**
 * Keeps each file in memory (it has to be validated whole — signature checks — before anything is written), but stops reading the
 * moment the request's running total passes the approved ceiling, so a request can never make the server hold much more than
 * `maxTotalBytes` however many bytes the client keeps sending. Never writes a temp file.
 */
const boundedMemoryStorage: multer.StorageEngine = {
  _handleFile(req, file, callback) {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const settle = (error: unknown, info?: Partial<Express.Multer.File>) => {
      if (settled) return;
      settled = true;
      if (error) chunks.length = 0;
      callback(error, info);
    };

    file.stream.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      const total = (totalByRequest.get(req) ?? 0) + chunk.length;
      totalByRequest.set(req, total);
      if (total > maxTotalBytes) {
        settle(new AppError(`The attachments total more than ${maxTotalBytes / MB} MB. Remove some files and try again.`, 413));
        return;
      }
      chunks.push(chunk);
    });
    file.stream.on("error", (error) => settle(error));
    file.stream.on("end", () => settle(null, { buffer: Buffer.concat(chunks), size }));
  },
  _removeFile(_req, file, callback) {
    delete (file as { buffer?: Buffer }).buffer;
    callback(null);
  },
};

const upload = multer({
  storage: boundedMemoryStorage,
  limits: {
    files: maxFiles,
    fileSize: maxFileBytes,
    // The request's own form fields are one small JSON "payload" — a few KB. These bound everything else.
    fields: 4,
    fieldSize: 256 * 1024,
    fieldNameSize: 100,
    parts: maxFiles + 4,
  },
}).array("files", maxFiles);

/** Turns Multer's / the multipart parser's raw failures into clear 400 / 413 AppErrors; anything unexpected is passed on untouched. */
function mapUploadError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return new AppError(`Each file must be ${maxFileBytes / MB} MB or smaller.`, 413);
      case "LIMIT_FILE_COUNT":
        return new AppError(`You can attach at most ${maxFiles} files to one request.`, 400);
      case "LIMIT_UNEXPECTED_FILE":
        return new AppError(`Unexpected file field. Attach files using the "files" field (at most ${maxFiles}).`, 400);
      case "LIMIT_PART_COUNT":
      case "LIMIT_FIELD_KEY":
      case "LIMIT_FIELD_VALUE":
      case "LIMIT_FIELD_COUNT":
        return new AppError("The request contains too many or too large form fields.", 400);
      default:
        return new AppError("The upload could not be read. Please try again.", 400);
    }
  }
  // Busboy's own parse failures (truncated body, bad boundary) are plain Errors.
  if (error instanceof Error && /multipart|form|boundary|unexpected end/i.test(error.message)) {
    return new AppError("The upload could not be read. Please try again.", 400);
  }
  return error;
}

/** Parses a multipart body (when that is what arrived); a JSON request passes straight through. */
export const parseInvoiceRequestUpload: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!req.is("multipart/form-data")) return next();
  upload(req, res, (error: unknown) => (error ? next(mapUploadError(error)) : next()));
};

/** After parsing: puts the multipart "payload" JSON back on req.body, so validate(createInvoiceRequestSchema) runs unchanged. */
export const unpackInvoiceRequestPayload: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.is("multipart/form-data")) return next();
  const raw = (req.body as Record<string, unknown> | undefined)?.payload;
  if (typeof raw !== "string") throw new AppError("The request details are missing.", 400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError("The request details could not be read.", 400);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AppError("The request details could not be read.", 400);
  }
  req.body = parsed;
  next();
};
