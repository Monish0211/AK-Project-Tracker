import { AppError } from "./AppError.js";
import { prisma } from "./prismaClient.js";

/**
 * DB-fresh Module Access lookup shared by the requireModuleAccess middleware and by service functions that must
 * authorize ONE operation of a route that several kinds of caller legitimately reach (e.g. PATCH /pr-requests/:id,
 * reachable by the requester AND by the assigned approver — each needs a different module). No role-name bypass:
 * an Administrator is checked against the same rows as everyone else.
 */
export async function userHasAnyModule(userId: string, moduleNames: readonly string[]): Promise<boolean> {
  const count = await prisma.userModuleAccess.count({
    where: { userId, module: { name: { in: [...moduleNames] } } },
  });
  return count > 0;
}

/** Throws 403 with `message` unless the user holds at least one of `moduleNames`. */
export async function assertModuleAccess(userId: string, moduleNames: readonly string[], message: string): Promise<void> {
  if (!(await userHasAnyModule(userId, moduleNames))) {
    throw new AppError(message, 403);
  }
}
