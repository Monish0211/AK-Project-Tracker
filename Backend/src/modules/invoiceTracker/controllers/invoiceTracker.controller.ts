import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as service from "../services/invoiceTracker.service.js";
import { outstandingQuerySchema, parseWith, trackerChainQuerySchema, trackerListQuerySchema, trackerProjectParamSchema } from "../validators/invoiceTracker.validators.js";

export const getInvoiceTrackerMonth = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getTrackerMonth(requireUser(req), parseWith(trackerListQuerySchema, req.query));
  res.status(200).json({ success: true, data });
});

export const getInvoiceTrackerRaisedBreakdown = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getRaisedBreakdown(requireUser(req), parseWith(trackerListQuerySchema, req.query));
  res.status(200).json({ success: true, data });
});

export const getInvoiceTrackerProjectInvoices = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = parseWith(trackerProjectParamSchema, req.params);
  const { month } = parseWith(trackerChainQuerySchema, req.query);
  res.status(200).json({ success: true, data: await service.getProjectRecords(requireUser(req), projectId, month) });
});

export const getInvoiceTrackerOutstanding = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getOutstanding(requireUser(req), parseWith(outstandingQuerySchema, req.query));
  res.status(200).json({ success: true, data });
});
