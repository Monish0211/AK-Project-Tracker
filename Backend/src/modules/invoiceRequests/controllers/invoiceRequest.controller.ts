import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as invoiceRequestService from "../services/invoiceRequest.service.js";
import { projectIdParamSchema } from "../validators/invoiceRequest.validators.js";
import type { CreateInvoiceRequestInput } from "../validators/invoiceRequest.validators.js";

function parseProjectIdParam(req: Request): string {
  const result = projectIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Project ID is required.", 400);
  }
  return result.data.projectId;
}

export const createInvoiceRequest = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const result = await invoiceRequestService.createInvoiceRequest(projectId, req.body as CreateInvoiceRequestInput, user);
  res.status(201).json({ success: true, data: result, message: "Invoice request sent." });
});

export const getInvoiceRequestsForProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const result = await invoiceRequestService.listInvoiceRequestsForProject(projectId, user);
  res.status(200).json({ success: true, data: result });
});
