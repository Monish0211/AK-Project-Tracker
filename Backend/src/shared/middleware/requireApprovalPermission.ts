import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { prisma } from "../utils/prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Fine-grained permission gate — distinct from authorize.ts's role-based
 * check. Must run after `authenticate` (needs `req.user`). Queries
 * UserApprovalPermission fresh on every request rather than trusting
 * anything on the JWT, matching authenticate.ts's own rationale: a
 * permission grant/revoke must take effect immediately, not at next token
 * refresh. Pass one or more ApprovalType names — access is granted if the
 * caller holds ANY of them.
 */
export function requireApprovalPermission(...approvalNames: string[]) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Authentication required.", 401);
    }

    const count = await prisma.userApprovalPermission.count({
      where: {
        userId: req.user.sub,
        approvalType: { name: { in: approvalNames } },
      },
    });

    if (count === 0) {
      throw new AppError("You do not have permission to perform this action.", 403);
    }

    next();
  });
}
