import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

/**
 * Role gate for routes. Must run after `authenticate` (needs `req.user`).
 * Named roles, not permission strings — matches the fixed PORTAL_ROLES list;
 * module/region/approval checks are separate, finer-grained middleware to be
 * added alongside the modules that need them (not required by Auth itself).
 */
export function authorize(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Authentication required.", 401);
    }

    if (!allowedRoles.includes(req.user.roleName)) {
      throw new AppError("You do not have permission to perform this action.", 403);
    }

    next();
  };
}
