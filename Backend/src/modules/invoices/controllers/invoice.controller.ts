import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as invoiceService from "../services/invoice.service.js";
import {
  invoiceLineIdParamSchema,
  projectIdParamSchema,
  quantityItemIdParamSchema,
} from "../validators/invoice.validators.js";
import type { CreateInvoiceLineInput, IngestInvoiceLinesInput, UpdateInvoiceLineInput } from "../validators/invoice.validators.js";

// Path params aren't covered by the shared `validate()` middleware (body
// only) — same manual-safeParse convention as quantity.controller.ts/
// milestone.controller.ts.
function parseProjectIdParam(req: Request): string {
  const result = projectIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Project ID is required.", 400);
  }
  return result.data.projectId;
}

function parseQuantityItemIdParam(req: Request): string {
  const result = quantityItemIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Quantity Item ID is required.", 400);
  }
  return result.data.quantityItemId;
}

function parseInvoiceLineIdParam(req: Request): string {
  const result = invoiceLineIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Invoice Line ID is required.", 400);
  }
  return result.data.id;
}

export const getInvoiceItemsByProject = asyncHandler(async (req: Request, res: Response) => {
  const projectId = parseProjectIdParam(req);
  const result = await invoiceService.listInvoiceItemsForProject(projectId);
  res.status(200).json({ success: true, data: result });
});

export const createInvoiceLine = asyncHandler(async (req: Request, res: Response) => {
  const quantityItemId = parseQuantityItemIdParam(req);
  const line = await invoiceService.createInvoiceLineForQuantityItem(quantityItemId, req.body as CreateInvoiceLineInput);
  res.status(201).json({ success: true, data: line, message: "Invoice line created successfully." });
});

export const updateInvoiceLine = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInvoiceLineIdParam(req);
  const line = await invoiceService.updateInvoiceLine(id, req.body as UpdateInvoiceLineInput);
  res.status(200).json({ success: true, data: line, message: "Invoice line updated successfully." });
});

export const deleteInvoiceLine = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInvoiceLineIdParam(req);
  await invoiceService.deleteInvoiceLine(id);
  res.status(200).json({ success: true, data: null, message: "Invoice line deleted successfully." });
});

// Ingest — legacy-migration only. See invoice.service.ts's
// ingestInvoiceLinesForProject() for the id/snapshot-preservation rationale.
export const ingestInvoiceLines = asyncHandler(async (req: Request, res: Response) => {
  const projectId = parseProjectIdParam(req);
  const result = await invoiceService.ingestInvoiceLinesForProject(projectId, req.body as IngestInvoiceLinesInput);
  res.status(201).json({
    success: true,
    data: result,
    message: `${result.items.length} invoice line(s) ingested successfully.`,
  });
});
