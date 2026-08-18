import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { validatePdfDocumentSet } from "../services/pdfValidation.service.js";
import { extractViaClaudeApi } from "../services/claudeExtraction.service.js";
import { parseClaudeRawResponse } from "../validators/claudeResponse.validators.js";
import { buildPdfImportAiCandidate } from "../services/pdfImportResponseAdapter.service.js";

/**
 * Orchestrates Steps 3 (validate) -> 4 (call Claude) -> 5 (parse/validate
 * response) -> 7 (adapt to PdfImportResponse shape). Any failure at any
 * stage throws an AppError, which asyncHandler forwards to the existing,
 * unmodified errorHandler.ts — the frontend treats any non-2xx response
 * from this endpoint as "fall back to the rule-engine result," so no
 * special "soft failure" response shape is needed here; every failure
 * path is a clean, safe-message error response.
 *
 * Multi-document cross-verification — accepts one or more PDFs
 * (field name "files", see pdfImport.routes.ts's upload.array()) as ONE
 * document set and sends all of them to Claude in a single request (see
 * claudeExtraction.service.ts). A single-file request is just a document
 * set of size 1 — the exact same code path, unchanged output shape.
 */
export const extractWithClaude = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  validatePdfDocumentSet(files);

  const documents = files!.map((file) => ({ buffer: file.buffer, fileName: file.originalname }));

  const claudeResult = await extractViaClaudeApi(documents);
  const parsed = parseClaudeRawResponse(claudeResult.rawText);

  if (!parsed.ok || !parsed.data) {
    throw new AppError(parsed.failureReason ?? "Claude returned an unusable response.", 502);
  }

  const candidate = buildPdfImportAiCandidate(parsed.data);

  res.status(200).json({ success: true, data: candidate });
});
