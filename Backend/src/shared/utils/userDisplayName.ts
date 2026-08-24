import { prisma } from "./prismaClient.js";

/**
 * The single server-side source of an authenticated caller's human-readable
 * name for attribution fields (ProjectNote.createdBy, InvoiceLine.createdBy)
 * that store a display string rather than a userId FK. Never trusts a
 * client-supplied name — always re-reads the current fullName for the
 * authenticated user's id (from the JWT's `sub`), so attribution can never
 * be spoofed as a different person.
 */
export async function getUserDisplayName(userId: string): Promise<string> {
  const user = await prisma.portalUser.findUnique({ where: { id: userId }, select: { fullName: true } });
  return user?.fullName ?? "Unknown User";
}
