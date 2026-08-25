import { AppError } from "../../../shared/utils/AppError.js";
import { addDays } from "../../../shared/utils/date.util.js";
import { DEFAULT_TEMP_PASSWORD } from "../../../shared/constants/password.constants.js";
import { env } from "../../../shared/utils/env.js";
import { hashPassword } from "../../../shared/utils/password.util.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { sendEmail } from "../../../shared/email/email.service.js";
import { buildAccountCreatedEmail } from "../../../shared/email/templates/accountCreated.template.js";
import { buildAdminPasswordResetEmail } from "../../../shared/email/templates/adminPasswordReset.template.js";
import type { CreatedUserDto, UserLookupsDto } from "../dto/createUser.dto.js";
import type { UserListItemDto } from "../dto/userList.dto.js";
import {
  createPortalUser,
  createUserApprovalPermissions,
  createUserModuleAccess,
  createUserRegionAccess,
  deleteUserById,
  findAllUsers,
  findRoleById,
  findUserByEmail,
  findUserById,
  findUserWithAccessById,
  getLookups as getLookupsFromRepository,
  replaceUserApprovalPermissions,
  replaceUserModuleAccess,
  replaceUserRegionAccess,
  resetPasswordToDefault,
  revokeAllRefreshTokensForUser,
  updatePortalUser,
} from "../repository/user.repository.js";
import type { CreateUserInput, UpdateUserInput } from "../validators/user.validators.js";

function toCreatedUserDto(
  user: Awaited<ReturnType<typeof createPortalUser>>
): CreatedUserDto {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    department: user.department,
    designation: user.designation,
    employeeType: user.employeeType,
    reportingManagerId: user.reportingManagerId,
    role: { id: user.role.id, name: user.role.name },
    isActive: user.isActive,
    forcePasswordChange: user.forcePasswordChange,
    createdAt: user.createdAt,
  };
}

export interface CreateUserResult {
  user: CreatedUserDto;
  /** False if the Account Created email failed or SMTP isn't configured — the user is still created either way. */
  emailSent: boolean;
}

/**
 * Creates a PortalUser plus its module/region/approval access grants as a
 * single atomic operation — the whole thing commits together or rolls back
 * together, so a failed access-grant insert can never leave behind a user
 * with no permissions at all.
 *
 * The Account Created email is sent AFTER this transaction has already
 * committed, and its own failure is caught and reported as a returned flag
 * — never re-thrown. Creating the user is the primary operation; the email
 * is a secondary, best-effort one. A user must never be rolled back or
 * deleted just because their welcome email couldn't be delivered.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const existingUser = await findUserByEmail(input.email);
  if (existingUser) {
    throw new AppError("A user with this email already exists.", 409);
  }

  const role = await findRoleById(input.roleId);
  if (!role) {
    throw new AppError("Selected role does not exist.", 400);
  }

  const passwordHash = await hashPassword(input.temporaryPassword);
  const passwordExpiresAt = addDays(new Date(), env.PASSWORD_EXPIRY_DAYS);

  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await createPortalUser(tx, {
      fullName: input.fullName,
      email: input.email,
      passwordHash,
      phoneNumber: input.phoneNumber ?? null,
      department: input.department ?? null,
      designation: input.designation ?? null,
      employeeType: input.employeeType ?? null,
      reportingManagerId: input.reportingManagerId ?? null,
      roleId: input.roleId,
      isActive: input.isActive ?? true,
      forcePasswordChange: input.forcePasswordChange ?? true,
      passwordExpiresAt,
    });

    await createUserModuleAccess(tx, user.id, input.moduleIds);
    await createUserRegionAccess(tx, user.id, input.regionIds);
    await createUserApprovalPermissions(tx, user.id, input.approvalIds);

    return user;
  });

  // Transaction already committed above — everything below is best-effort.
  // Sent exactly once, here, and nowhere else in the create-user path.
  const emailSent = await sendAccountCreatedEmail(createdUser, input.temporaryPassword);

  return { user: toCreatedUserDto(createdUser), emailSent };
}

/**
 * Isolated in its own try/catch on top of sendEmail()'s own internal one,
 * so even an unexpected error building the template — not just an SMTP
 * delivery failure — can never escape and affect the user creation this
 * already succeeded. Only ever sends the plaintext temporary password the
 * Administrator supplied — never the password hash — and no internal ids.
 */
async function sendAccountCreatedEmail(
  user: Awaited<ReturnType<typeof createPortalUser>>,
  temporaryPassword: string
): Promise<boolean> {
  try {
    const email = buildAccountCreatedEmail({
      fullName: user.fullName,
      email: user.email,
      temporaryPassword,
      roleName: user.role.name,
      loginUrl: `${env.FRONTEND_URL}/login`,
    });

    const result = await sendEmail({ to: user.email, subject: email.subject, html: email.html });

    if (!result.success) {
      console.error(`[users] Account Created email failed for ${user.email}: ${result.error}`);
    }

    return result.success;
  } catch (error) {
    console.error(
      `[users] Unexpected error while sending Account Created email for ${user.email}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

export function getLookups(): Promise<UserLookupsDto> {
  return getLookupsFromRepository();
}

function toUserListItemDto(user: Awaited<ReturnType<typeof findAllUsers>>[number]): UserListItemDto {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    department: user.department,
    designation: user.designation,
    employeeType: user.employeeType,
    reportingManagerId: user.reportingManagerId,
    reportingManagerName: user.reportingManager?.fullName ?? null,
    role: { id: user.role.id, name: user.role.name },
    isActive: user.isActive,
    forcePasswordChange: user.forcePasswordChange,
    accountLocked: user.accountLocked,
    lastLogin: user.lastLogin,
    passwordResetAt: user.passwordResetAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    modules: user.moduleAccess.map((grant) => grant.module.name),
    regions: user.regionAccess.map((grant) => grant.region.name),
    approvals: user.approvalPermissions.map((grant) => grant.approvalType.name),
  };
}

/** Every PortalUser, with role/module/region/approval access resolved to names — the Settings > User Management directory. */
export async function getUsers(): Promise<UserListItemDto[]> {
  const users = await findAllUsers();
  return users.map(toUserListItemDto);
}

/**
 * Edit User Profile — updates the profile/role/permission fields the drawer
 * exposes, all inside one transaction so a failed permission-grant rewrite
 * can never leave the profile fields committed with stale access rows (or
 * vice versa). Password fields are deliberately out of scope here — Auth's
 * own endpoints and the admin-reset endpoint above own those.
 *
 * P0-01 — self-role-change guard, same shape as deleteUser()'s self-delete
 * guard below: checked first, before any DB read/write, so a rejected
 * request never applies even its own non-role fields (no partial update).
 * "PMO Manager" and "Administrator" share every user-management route
 * (see user.routes.ts's authorize("Administrator","PMO Manager")), but the
 * role NAME itself independently gates real capability elsewhere (company-
 * wide project/data ownership bypass, audit-log access, manual Timesheet
 * Excel import, Timesheet delete/clear, milestone/invoice ingest — see
 * projectAccess.ts, dashboard/timesheet/resource controllers' own
 * `roleName === "Administrator"` checks, and the Administrator-only routes
 * in timesheet.routes.ts/milestone.routes.ts/invoice.routes.ts/
 * auth.routes.ts). Without this guard, any PMO Manager could set their own
 * roleId to Administrator's and gain all of that immediately — a genuine
 * privilege escalation, not merely a cosmetic role-name change. Editing
 * ANY OTHER user's role (by an Administrator or a PMO Manager, per the
 * existing, unchanged authorize() gate) is completely unaffected — this
 * guard fires only when the caller and the target are the same account AND
 * the request includes a roleId.
 */
export async function updateUser(
  targetUserId: string,
  input: UpdateUserInput,
  requestingUserId: string
): Promise<UserListItemDto> {
  if (targetUserId === requestingUserId && input.roleId !== undefined) {
    throw new AppError("You cannot change your own role.", 400);
  }

  const existingUser = await findUserById(targetUserId);
  if (!existingUser) {
    throw new AppError("User not found.", 404);
  }

  if (input.email && input.email !== existingUser.email) {
    const emailOwner = await findUserByEmail(input.email);
    if (emailOwner && emailOwner.id !== targetUserId) {
      throw new AppError("A user with this email already exists.", 409);
    }
  }

  if (input.roleId) {
    const role = await findRoleById(input.roleId);
    if (!role) {
      throw new AppError("Selected role does not exist.", 400);
    }
  }

  // Decided before the transaction, against the pre-update row — only a
  // transition INTO deactivated/locked revokes sessions; toggling either
  // flag off (re-activating/unlocking) must not touch refresh tokens, same
  // as the unlock case below.
  const isNewlyDeactivated = input.isActive === false && existingUser.isActive !== false;
  const isNewlyLocked = input.accountLocked === true && existingUser.accountLocked !== true;

  await prisma.$transaction(async (tx) => {
    await updatePortalUser(tx, targetUserId, {
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phoneNumber !== undefined && { phoneNumber: input.phoneNumber }),
      ...(input.department !== undefined && { department: input.department }),
      ...(input.designation !== undefined && { designation: input.designation }),
      ...(input.employeeType !== undefined && { employeeType: input.employeeType }),
      ...(input.roleId !== undefined && { roleId: input.roleId }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.forcePasswordChange !== undefined && { forcePasswordChange: input.forcePasswordChange }),
      ...(input.accountLocked !== undefined && { accountLocked: input.accountLocked }),
    });

    await replaceUserModuleAccess(tx, targetUserId, input.moduleIds);
    await replaceUserRegionAccess(tx, targetUserId, input.regionIds);
    await replaceUserApprovalPermissions(tx, targetUserId, input.approvalIds);
  });

  // Deactivating or locking a user must end their existing session, not
  // just block new ones — every outstanding refresh token stops working
  // immediately (refreshAccessToken() also independently re-checks
  // isActive/accountLocked on the user row it already loads, so this holds
  // even for a token issued in the brief window before this call commits).
  if (isNewlyDeactivated || isNewlyLocked) {
    await revokeAllRefreshTokensForUser(targetUserId);
  }

  // An account unlocked/reactivated via this toggle should behave like any
  // other unlock — the same revoke-everything-and-force-a-fresh-login
  // reasoning resetPassword() already applies doesn't apply here (the
  // password itself didn't change), so refresh tokens are left alone.
  const updatedUser = await findUserWithAccessById(targetUserId);
  if (!updatedUser) {
    throw new AppError("User not found after update.", 404);
  }

  return toUserListItemDto(updatedUser);
}

/**
 * Administrator-initiated reset: sets the account back to the default
 * temporary password and forces a change on next login, exactly like a
 * freshly created user. No client-supplied password here — Reset Password
 * always resets to the one configured default (see password.constants.ts).
 *
 * The password reset itself is the primary operation and has already
 * committed by the time the Administrator Password Reset email is sent —
 * same "email is secondary, best-effort" rule createUser() follows. This is
 * a dedicated template (adminPasswordReset.template.ts), never
 * resetSuccess.template.ts — that one is for a password the account holder
 * changed themselves, which isn't what happened here.
 */
export async function resetPassword(targetUserId: string): Promise<void> {
  const user = await findUserWithAccessById(targetUserId);

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  const passwordHash = await hashPassword(DEFAULT_TEMP_PASSWORD);
  await resetPasswordToDefault(targetUserId, passwordHash);
  await revokeAllRefreshTokensForUser(targetUserId);

  await sendAdminPasswordResetEmail(user, DEFAULT_TEMP_PASSWORD);
}

/**
 * Isolated in its own try/catch on top of sendEmail()'s own internal one,
 * matching sendAccountCreatedEmail()'s shape — a template-building error
 * must never surface as a failure of the password reset that already
 * succeeded.
 */
async function sendAdminPasswordResetEmail(
  user: NonNullable<Awaited<ReturnType<typeof findUserWithAccessById>>>,
  temporaryPassword: string
): Promise<boolean> {
  try {
    const email = buildAdminPasswordResetEmail({
      fullName: user.fullName,
      email: user.email,
      temporaryPassword,
      roleName: user.role.name,
      loginUrl: `${env.FRONTEND_URL}/login`,
    });

    const result = await sendEmail({ to: user.email, subject: email.subject, html: email.html });

    if (!result.success) {
      console.error(`[users] Administrator Password Reset email failed for ${user.email}: ${result.error}`);
    }

    return result.success;
  } catch (error) {
    console.error(
      `[users] Unexpected error while sending Administrator Password Reset email for ${user.email}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

/**
 * Permanent delete — the self-delete guard exists because an Administrator
 * deleting their own only active session would have no way back into the
 * portal without going around the API (e.g. direct DB access) to undo it.
 */
export async function deleteUser(targetUserId: string, requestingUserId: string): Promise<void> {
  if (targetUserId === requestingUserId) {
    throw new AppError("You cannot delete your own account.", 400);
  }

  const user = await findUserById(targetUserId);
  if (!user) {
    throw new AppError("User not found.", 404);
  }

  await deleteUserById(targetUserId);
}
