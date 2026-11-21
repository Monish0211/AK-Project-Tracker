import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as adminService from "../services/prRequestAdmin.service.js";
import { prRequestIdParamSchema } from "../validators/prRequest.validators.js";
import { adminListPRRequestsQuerySchema } from "../validators/prRequestAdmin.validators.js";
import type { AdminEditPRRequestInput, AdminReasonInput, AdminReassignInput } from "../validators/prRequestAdmin.validators.js";

function idOf(req: Request): string {
  const result = prRequestIdParamSchema.safeParse(req.params);
  if (!result.success) throw new AppError("PR Request ID is required.", 400);
  return result.data.id;
}

export const listAllForAdmin = asyncHandler(async (req: Request, res: Response) => {
  const query = adminListPRRequestsQuerySchema.safeParse(req.query);
  if (!query.success) throw new AppError(query.error.issues[0]?.message ?? "Invalid filter.", 400);
  res.status(200).json({ success: true, data: await adminService.listAllForAdmin(requireUser(req), query.data) });
});

export const getDetailForAdmin = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await adminService.getDetailForAdmin(idOf(req), requireUser(req)) });
});

export const adminEdit = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.adminEdit(idOf(req), requireUser(req), req.body as AdminEditPRRequestInput);
  res.status(200).json({ success: true, data, message: "PR Request updated by an administrator." });
});

export const adminApprove = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.adminApprove(idOf(req), requireUser(req), (req.body as AdminReasonInput).reason);
  res.status(200).json({ success: true, data, message: "Approved by an administrator at the current stage." });
});

export const adminReject = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.adminReject(idOf(req), requireUser(req), (req.body as AdminReasonInput).reason);
  res.status(200).json({ success: true, data, message: "Rejected by an administrator." });
});

export const adminReassign = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.adminReassign(idOf(req), requireUser(req), req.body as AdminReassignInput);
  res.status(200).json({ success: true, data, message: "Approver reassigned." });
});

export const adminDelete = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.adminDelete(idOf(req), requireUser(req), (req.body as AdminReasonInput).reason);
  res.status(200).json({ success: true, data, message: "PR Request deleted by an administrator." });
});
