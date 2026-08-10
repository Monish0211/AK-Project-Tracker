import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import * as userService from "../services/user.service.js";
import type { CreateUserInput } from "../validators/user.validators.js";

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const created = await userService.createUser(req.body as CreateUserInput);
  res.status(201).json({ success: true, data: created, message: "User created successfully." });
});

export const getLookups = asyncHandler(async (_req: Request, res: Response) => {
  const lookups = await userService.getLookups();
  res.status(200).json({ success: true, data: lookups });
});
