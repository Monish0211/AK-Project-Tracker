import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as service from "../services/invoicePayment.service.js";
import { PaymentRejectedError } from "../services/invoicePayment.service.js";
import { paymentIdParamSchema, paymentQuerySchema } from "../validators/invoicePayment.validators.js";
import type { PreviewPaymentInput, SavePaymentInput } from "../validators/invoicePayment.validators.js";

/** A rejection with a structured body (field errors / rule violations) is returned as-is; everything else flows to the shared error handler. */
function respondRejected(error: unknown, res: Response): boolean {
  if (error instanceof PaymentRejectedError) {
    res.status(error.statusCode).json({ success: false, message: error.message, ...error.payload });
    return true;
  }
  return false;
}

export const getInvoicePayments = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = paymentQuerySchema.safeParse(req.query);
  if (!query.success) throw new AppError("projectId and invoiceNo are required.", 400);
  const data = await service.getInvoicePaymentOverview(query.data.projectId, query.data.invoiceNo, user);
  res.status(200).json({ success: true, data });
});

export const previewInvoicePayment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const data = await service.previewInvoicePayment(req.body as PreviewPaymentInput, user);
  res.status(200).json({ success: true, data });
});

export const recordInvoicePayment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  try {
    const data = await service.recordInvoicePayment(req.body as SavePaymentInput, user);
    res.status(data.replayed ? 200 : 201).json({ success: true, data });
  } catch (error) {
    if (!respondRejected(error, res)) throw error;
  }
});

export const reverseInvoicePayment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const params = paymentIdParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Payment ID is required.", 400);
  const data = await service.reverseInvoicePayment(params.data.id, (req.body as { reason: string }).reason, user);
  res.status(200).json({ success: true, data });
});
