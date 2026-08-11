import { prisma } from "../../../shared/utils/prismaClient.js";

/**
 * All Prisma access for Auth lives here — services never import `prisma`
 * directly. `include: { role: true }` is enough for login (the token only
 * needs roleId/roleName); `findUserAccessById` additionally pulls the
 * per-user module/region/approval grants, needed only by `GET /auth/me`.
 */
export function findUserByEmail(email: string) {
  return prisma.portalUser.findUnique({
    where: { email },
    include: { role: true },
  });
}

export function findUserById(id: string) {
  return prisma.portalUser.findUnique({
    where: { id },
    include: { role: true },
  });
}

export function findUserAccessById(id: string) {
  return prisma.portalUser.findUnique({
    where: { id },
    include: {
      role: true,
      reportingManager: { select: { id: true, fullName: true } },
      moduleAccess: { include: { module: true } },
      regionAccess: { include: { region: true } },
      approvalPermissions: { include: { approvalType: true } },
    },
  });
}

export function updateLastLogin(id: string, lastLogin: Date) {
  return prisma.portalUser.update({
    where: { id },
    data: { lastLogin },
  });
}

export function setForcePasswordChange(id: string, forcePasswordChange: boolean) {
  return prisma.portalUser.update({
    where: { id },
    data: { forcePasswordChange },
  });
}

/**
 * A fresh, known-good password clears every security flag that existed
 * because of the OLD password — shared by both self-service change and
 * token-based reset, since "the user just proved they know/own the new
 * password" means the same thing either way.
 */
export function setNewPassword(id: string, passwordHash: string, passwordExpiresAt: Date) {
  return prisma.portalUser.update({
    where: { id },
    data: {
      passwordHash,
      passwordExpiresAt,
      passwordResetAt: new Date(),
      forcePasswordChange: false,
      accountLocked: false,
      failedLoginAttempts: 0,
    },
  });
}

/**
 * Returns the post-increment count so the service can decide, in one round
 * trip, whether this attempt just crossed the lockout threshold.
 */
export async function incrementFailedLoginAttempts(id: string): Promise<number> {
  const user = await prisma.portalUser.update({
    where: { id },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });
  return user.failedLoginAttempts;
}

export function resetFailedLoginAttempts(id: string) {
  return prisma.portalUser.update({
    where: { id },
    data: { failedLoginAttempts: 0 },
  });
}

export function lockAccount(id: string) {
  return prisma.portalUser.update({
    where: { id },
    data: { accountLocked: true },
  });
}

export function createRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
  return prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });
}

export function findRefreshTokenByHash(tokenHash: string) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { include: { role: true } } },
  });
}

/**
 * Rotation, not reuse: the old token is marked revoked/replaced and a brand
 * new row is created, in one transaction, so a stolen-and-replayed old
 * token is both rejected and traceable to what it was rotated into.
 */
export function rotateRefreshToken(oldTokenId: string, userId: string, newTokenHash: string, newExpiresAt: Date) {
  return prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: oldTokenId },
      data: { revokedAt: new Date(), replacedByTokenHash: newTokenHash },
    }),
    prisma.refreshToken.create({
      data: { userId, tokenHash: newTokenHash, expiresAt: newExpiresAt },
    }),
  ]);
}

export function revokeRefreshTokenByHash(tokenHash: string) {
  return prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Called whenever a password changes (self-service or reset) — every other
 * device's refresh token is invalidated so a compromised-password scenario
 * can't be ridden out on an already-issued token.
 */
export function revokeAllRefreshTokensForUser(userId: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
  return prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });
}

export function findPasswordResetTokenByHash(tokenHash: string) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
}

export function markPasswordResetTokenUsed(id: string) {
  return prisma.passwordResetToken.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}

export interface AuthAuditEntry {
  userId?: string | null | undefined;
  email: string;
  event: string;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
}

export function createAuditLog(entry: AuthAuditEntry) {
  return prisma.authAuditLog.create({
    data: {
      userId: entry.userId ?? null,
      email: entry.email,
      event: entry.event,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}
