import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as prRequestService from "../services/prRequest.service.js";
import { prRequestIdParamSchema } from "../validators/prRequest.validators.js";
import type {
  ApproveRemarksInput,
  RejectPRRequestInput,
  SaveDraftPRRequestInput,
  SendToAccountsInput,
} from "../validators/prRequest.validators.js";

function parseIdParam(req: Request): string {
  const result = prRequestIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("PR Request ID is required.", 400);
  }
  return result.data.id;
}

export const saveDraftPRRequest = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await prRequestService.saveDraftPRRequest(req.body as SaveDraftPRRequestInput, user);
  res.status(201).json({ success: true, data: result, message: "PR Request saved as Draft." });
});

export const updatePRRequestProjectData = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  const result = await prRequestService.updatePRRequestProjectData(id, req.body as SaveDraftPRRequestInput, user);
  res.status(200).json({ success: true, data: result, message: "PR Request updated." });
});

export const deleteDraftPRRequest = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  await prRequestService.deleteDraftPRRequest(id, user);
  res.status(200).json({ success: true, data: null, message: "Draft PR Request deleted." });
});

export const sendToAccounts = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  const result = await prRequestService.sendToAccounts(id, req.body as SendToAccountsInput, user);
  res.status(200).json({ success: true, data: result, message: "PR Request sent to Accounts for approval." });
});

export const getMyPRRequests = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await prRequestService.listMyPRRequests(user);
  res.status(200).json({ success: true, data: result });
});

export const getApprovalsQueue = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await prRequestService.listApprovalsQueueForCaller(user);
  res.status(200).json({ success: true, data: result });
});

export const getPRRequestDetail = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  const result = await prRequestService.getPRRequestDetail(id, user);
  res.status(200).json({ success: true, data: result });
});

export const accountsApprove = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  const { remarks } = req.body as ApproveRemarksInput;
  const result = await prRequestService.accountsApprove(id, user, remarks);
  res.status(200).json({ success: true, data: result, message: "PR Request approved — awaiting PMO Manager approval." });
});

export const pmoManagerApprove = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  const { remarks } = req.body as ApproveRemarksInput;
  const result = await prRequestService.pmoManagerApprove(id, user, remarks);
  res.status(200).json({ success: true, data: result, message: "PR Request approved — Project created." });
});

export const rejectPRRequest = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  const { reason } = req.body as RejectPRRequestInput;
  const result = await prRequestService.rejectPRRequest(id, user, reason);
  res.status(200).json({ success: true, data: result, message: "PR Request rejected." });
});
