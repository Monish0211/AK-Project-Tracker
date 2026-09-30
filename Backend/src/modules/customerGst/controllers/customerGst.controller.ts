import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { validateGstDocumentUpload } from "../services/gstFileValidation.service.js";
import { extractGstViaClaudeApi } from "../services/gstClaudeExtraction.service.js";
import { parseGstClaudeResponse } from "../validators/gstClaudeResponse.validators.js";
import { buildGstExtractionCandidate } from "../services/gstExtractionAdapter.service.js";

/**
 * Orchestrates validate -> call Claude -> parse/validate response -> adapt
 * to the reviewable candidate shape — same pipeline shape as pdfImport's
 * extractWithClaude, applied to a single GST document instead of a document
 * set. Never persists anything: the uploaded file lives only in memory for
 * the duration of this one request (multer memoryStorage, see
 * customer.routes.ts) and is discarded once this handler returns. A
 * Customer row and its GST document are only ever written by the separate,
 * explicit Save Customer / upload-GST-document actions the frontend calls
 * afterward — never automatically from this endpoint.
 */
export const extractCustomerGstDocument = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  const kind = validateGstDocumentUpload(file);

  const claudeResult = await extractGstViaClaudeApi(file!.buffer, kind);
  const parsed = parseGstClaudeResponse(claudeResult.rawText);

  if (!parsed.ok || !parsed.data) {
    throw new AppError(parsed.failureReason ?? "Claude returned an unusable response.", 502);
  }

  const candidate = buildGstExtractionCandidate(parsed.data);

  res.status(200).json({ success: true, data: candidate });
});
