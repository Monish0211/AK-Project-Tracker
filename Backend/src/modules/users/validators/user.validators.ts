import { z } from "zod";

export const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required."),
  email: z.string().trim().toLowerCase().min(1, "Email is required.").email("Enter a valid email address."),

  phoneNumber: z.string().trim().min(1).optional().nullable(),
  department: z.string().trim().min(1).optional().nullable(),
  designation: z.string().trim().min(1).optional().nullable(),
  reportingManagerId: z.string().uuid("reportingManagerId must be a valid UUID.").optional().nullable(),
  employeeType: z.string().trim().min(1).optional().nullable(),
  isActive: z.boolean().optional().default(true),

  temporaryPassword: z.string().min(8, "Temporary password must be at least 8 characters long."),
  forcePasswordChange: z.boolean().optional().default(true),

  roleId: z.string().min(1, "roleId is required.").uuid("roleId must be a valid UUID."),

  moduleIds: z.array(z.string().uuid("Each moduleId must be a valid UUID.")).default([]),
  regionIds: z.array(z.string().uuid("Each regionId must be a valid UUID.")).default([]),
  approvalIds: z.array(z.string().uuid("Each approvalId must be a valid UUID.")).default([]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Edit User Profile — everything the drawer's General Information/System
 * Role/Module Access/Project Region Access/Approval Rights/Account Security
 * sections can change. No password/temporaryPassword field here on purpose:
 * password changes go through Auth's own endpoints (self-service, forced
 * first-login, forgot-password, or the Users module's admin-reset), never
 * through a plain profile update. reportingManagerId is likewise omitted —
 * same as createUserSchema, there's no real reporting-manager lookup yet.
 */
export const updateUserSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").optional(),
  email: z.string().trim().toLowerCase().min(1, "Email is required.").email("Enter a valid email address.").optional(),

  phoneNumber: z.string().trim().min(1).optional().nullable(),
  department: z.string().trim().min(1).optional().nullable(),
  designation: z.string().trim().min(1).optional().nullable(),
  employeeType: z.string().trim().min(1).optional().nullable(),
  isActive: z.boolean().optional(),

  roleId: z.string().uuid("roleId must be a valid UUID.").optional(),

  moduleIds: z.array(z.string().uuid("Each moduleId must be a valid UUID.")).optional(),
  regionIds: z.array(z.string().uuid("Each regionId must be a valid UUID.")).optional(),
  approvalIds: z.array(z.string().uuid("Each approvalId must be a valid UUID.")).optional(),

  forcePasswordChange: z.boolean().optional(),
  accountLocked: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
