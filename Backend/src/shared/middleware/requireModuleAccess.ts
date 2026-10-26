import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { userHasAnyModule } from "../utils/moduleAccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Backend enforcement of Module Access — mirrors requireApprovalPermission.ts
 * exactly (same DB-fresh-per-request pattern, same shape). Previously
 * Module Access was enforced only client-side (Sidebar nav filtering,
 * ModuleRoute route guard) — a user without a module grant could still call
 * the underlying API directly. Must run after `authenticate`. Pass one or
 * more Module names — access is granted if the caller holds ANY of them.
 */
export function requireModuleAccess(...moduleNames: string[]) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Authentication required.", 401);
    }

    if (!(await userHasAnyModule(req.user.sub, moduleNames))) {
      throw new AppError("You do not have access to this module.", 403);
    }

    next();
  });
}
