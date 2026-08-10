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
