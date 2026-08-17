import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { validatePdfUpload } from "../services/pdfValidation.service.js";
import { extractViaClaudeApi } from "../services/claudeExtraction.service.js";
import { parseClaudeRawResponse } from "../validators/claudeResponse.validators.js";
import { buildPdfImportAiCandidate } from "../services/pdfImportResponseAdapter.service.js";

/**
 * Orchestrates Steps 3 (validate) -> 4 (call Claude) -> 5 (parse/validate
 * response) -> 7 (adapt to PdfImportResponse shape). Any failure at any
 * stage throws an AppError, which asyncHandler forwards to the existing,
 * unmodified errorHandler.ts — the frontend (Step 12) treats any non-2xx
 * response from this endpoint as "fall back to the rule-engine result,"
 * so no special "soft failure" response shape is needed here; every
 * failure path is a clean, safe-message error response.
 */
export const extractWithClaude = asyncHandler(async (req: Request, res: Response) => {
  validatePdfUpload(req.file);
  const file = req.file!;

  const claudeResult = await extractViaClaudeApi(file.buffer, file.originalname);
  const parsed = parseClaudeRawResponse(claudeResult.rawText);

  if (!parsed.ok || !parsed.data) {
    throw new AppError(parsed.failureReason ?? "Claude returned an unusable response.", 502);
  }

  const candidate = buildPdfImportAiCandidate(parsed.data);

  res.status(200).json({ success: true, data: candidate });
});
