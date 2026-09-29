import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import { runExpenseImport } from "./expenseImport.service.js";

/** multer puts every non-file multipart field on req.body as a plain string — a JSON-encoded array (e.g. '["id1","id2"]'), not an actual array. Also tolerates an already-parsed array, for any future non-multipart caller. */
function parseConfirmedProjectIds(body: unknown): string[] {
  const raw = (body as { confirmedProjectIds?: unknown } | undefined)?.confirmedProjectIds;
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string");
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      // Malformed — treat as "no confirmations", never crash the request over it.
    }
  }
  return [];
}

async function handleImportRequest(req: Request, res: Response, commit: boolean) {
  const user = requireUser(req);
  if (!req.file) {
    throw new AppError("No file was uploaded. Expected a multipart field named \"file\".", 400);
  }
  const confirmedProjectIds = parseConfirmedProjectIds(req.body);
  const result = await runExpenseImport(
    { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype },
    user,
    commit,
    confirmedProjectIds
  );
  res.status(200).json({ success: true, data: result });
}

/** POST /projects/expenses/import/preview — parses + classifies, never writes. */
export const previewExpenseImport = asyncHandler(async (req: Request, res: Response) => {
  await handleImportRequest(req, res, false);
});

/** POST /projects/expenses/import — same logic as preview, persists under one new ExpenseImportBatch when applicable. */
export const commitExpenseImport = asyncHandler(async (req: Request, res: Response) => {
  await handleImportRequest(req, res, true);
});
