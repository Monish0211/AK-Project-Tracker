import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as userService from "../services/user.service.js";
import { usersByRoleQuerySchema } from "../validators/user.validators.js";
import type { CreateUserInput, UpdateUserInput } from "../validators/user.validators.js";

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { user, emailSent } = await userService.createUser(req.body as CreateUserInput);
  const message = emailSent ? "User created successfully." : "User created successfully. Email delivery failed.";
  res.status(201).json({ success: true, data: user, message });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Authentication required.", 401);
  }

  const updated = await userService.updateUser(req.params.id as string, req.body as UpdateUserInput, req.user.sub);
  res.status(200).json({ success: true, data: updated, message: "User updated successfully." });
});

export const getUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await userService.getUsers();
  res.status(200).json({ success: true, data: users });
});

export const getLookups = asyncHandler(async (_req: Request, res: Response) => {
  const lookups = await userService.getLookups();
  res.status(200).json({ success: true, data: lookups });
});

export const getUsersByRole = asyncHandler(async (req: Request, res: Response) => {
  const result = usersByRoleQuerySchema.safeParse(req.query);
  if (!result.success) {
    throw new AppError("role is required.", 400);
  }
  const users = await userService.getUsersByRole(result.data.role);
  res.status(200).json({ success: true, data: users });
});

export const getEligibleInvoiceRaisers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await userService.getEligibleInvoiceRaisers();
  res.status(200).json({ success: true, data: users });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await userService.resetPassword(req.params.id as string);
  res.status(200).json({ success: true, data: null, message: "Password reset successfully." });
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Authentication required.", 401);
  }

  await userService.deleteUser(req.params.id as string, req.user.sub);
  res.status(200).json({ success: true, data: null, message: "User deleted successfully." });
});
