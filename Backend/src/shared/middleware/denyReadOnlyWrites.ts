import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../utils/prismaClient.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Write restriction for the "Read Only" system role.
 *
 * Must run after `authenticate` (needs `req.user.roleName`). Does not
 * replace Module Access, Project Ownership, or Approval checks — those
 * remain on their existing routes/services. Safe (read) methods always
 * pass through; every other HTTP method is rejected with 403.
 *
 * Auth/account endpoints (login, logout, change-password, refresh) must
 * NOT use this middleware — those are not business-data mutations.
 */
export function denyReadOnlyWrites(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new AppError("Authentication required.", 401);
  }

  if (req.user.roleName === "Read Only" && !SAFE_METHODS.has(req.method.toUpperCase())) {
    throw new AppError("Read Only users cannot modify data.", 403);
  }

  next();
}

/**
 * Where a coordinator-exception route finds the project it writes to:
 * a ":projectId"-style path param, or the child record's OWN projectId
 * (never a client-supplied one) for "/<child>/:id" routes.
 */
export type CoordinatorProjectSource =
  | { param: string }
  | {
      child: "quantityItem" | "paymentMilestone" | "projectExpense" | "projectReminder" | "projectResource" | "timesheetEntry";
      param?: string;
    };

async function resolveProjectId(req: Request, source: CoordinatorProjectSource): Promise<string | null> {
  const value = req.params[source.param ?? "id"];
  if (typeof value !== "string" || value.length === 0) return null;
  if (!("child" in source)) return value;
  const where = { where: { id: value }, select: { projectId: true } } as const;
  switch (source.child) {
    case "quantityItem":
      return (await prisma.quantityItem.findUnique(where))?.projectId ?? null;
    case "paymentMilestone":
      return (await prisma.paymentMilestone.findUnique(where))?.projectId ?? null;
    case "projectExpense":
      return (await prisma.projectExpense.findUnique(where))?.projectId ?? null;
    case "projectReminder":
      return (await prisma.projectReminder.findUnique(where))?.projectId ?? null;
    case "projectResource":
      return (await prisma.projectResource.findUnique(where))?.projectId ?? null;
    case "timesheetEntry":
      // An "Unassigned" entry (projectId: null) belongs to no project, so it
      // never qualifies for the exception.
      return (await prisma.timesheetEntry.findUnique(where))?.projectId ?? null;
  }
}

/**
 * The PMO Coordinator exception (Oct 2026, final rule "full project
 * responsibility"): a Read Only user may write to a project ONLY while they
 * are that project's assigned PMO Coordinator account — the project's own
 * fields and its ordinary operational data (notes, document upload,
 * quantities, milestones, expenses, reminders, team resources, its
 * timesheet entries). Every route that keeps plain denyReadOnlyWrites stays
 * blocked for Read Only even on the assigned project: create/import,
 * archive/restore/permanent delete, every invoice and invoice-request write,
 * and all other modules.
 *
 * Read fresh from the database on every request (never from the token), so
 * reassigning or clearing the coordinator revokes it immediately. This only
 * lifts the Read Only block: module access, approval rights, and the
 * service's own project-access check (canAccessProject) still run after it.
 * Never changes the user's account or role.
 */
export function denyReadOnlyWritesExceptAssignedCoordinator(source: CoordinatorProjectSource = { param: "id" }) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Authentication required.", 401);
    }
    if (req.user.roleName !== "Read Only" || SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const projectId = await resolveProjectId(req, source);
    const project = projectId
      ? await prisma.project.findUnique({ where: { id: projectId }, select: { pmoCoordinatorUserId: true } })
      : null;
    if (!project || project.pmoCoordinatorUserId !== req.user.sub) {
      throw new AppError("Read Only users cannot modify data.", 403);
    }

    next();
  });
}
