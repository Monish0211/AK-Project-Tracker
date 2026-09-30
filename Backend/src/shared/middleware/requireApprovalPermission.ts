import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { prisma } from "../utils/prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * The actual data check both this middleware and any business-logic-level
 * gate (e.g. invoice.service.ts's Raise Invoice status-transition guard —
 * see that file's own comment for why a route-level middleware alone can't
 * cover it) need — queries UserApprovalPermission fresh on every call rather
 * than trusting anything on the JWT, matching authenticate.ts's own
 * rationale: a permission grant/revoke must take effect immediately, not at
 * next token refresh. Access is granted if the user holds ANY of the named
 * approval types.
 */
export async function userHasApprovalPermission(userId: string, approvalNames: string[]): Promise<boolean> {
  const count = await prisma.userApprovalPermission.count({
    where: {
      userId,
      approvalType: { name: { in: approvalNames } },
    },
  });
  return count > 0;
}

/**
 * Fine-grained permission gate — distinct from authorize.ts's role-based
 * check. Must run after `authenticate` (needs `req.user`). Pass one or more
 * ApprovalType names — access is granted if the caller holds ANY of them.
 */
export function requireApprovalPermission(...approvalNames: string[]) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Authentication required.", 401);
    }

    if (!(await userHasApprovalPermission(req.user.sub, approvalNames))) {
      throw new AppError("You do not have permission to perform this action.", 403);
    }

    next();
  });
}
