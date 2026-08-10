import { AppError } from "../../../shared/utils/AppError.js";
import { addDays } from "../../../shared/utils/date.util.js";
import { env } from "../../../shared/utils/env.js";
import { hashPassword } from "../../../shared/utils/password.util.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import type { CreatedUserDto, UserLookupsDto } from "../dto/createUser.dto.js";
import {
  createPortalUser,
  createUserApprovalPermissions,
  createUserModuleAccess,
  createUserRegionAccess,
  findRoleById,
  findUserByEmail,
  getLookups as getLookupsFromRepository,
} from "../repository/user.repository.js";
import type { CreateUserInput } from "../validators/user.validators.js";

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

/**
 * Creates a PortalUser plus its module/region/approval access grants as a
 * single atomic operation — the whole thing commits together or rolls back
 * together, so a failed access-grant insert can never leave behind a user
 * with no permissions at all.
 */
export async function createUser(input: CreateUserInput): Promise<CreatedUserDto> {
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

  return toCreatedUserDto(createdUser);
}

export function getLookups(): Promise<UserLookupsDto> {
  return getLookupsFromRepository();
}
