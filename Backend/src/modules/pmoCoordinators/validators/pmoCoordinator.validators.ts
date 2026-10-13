import { z } from "zod";

/**
 * Settings → PMO Coordinators. The email is stored exactly as supplied
 * (surrounding whitespace trimmed only — never lower-cased or "corrected");
 * matching and duplicate detection use emailNormalized instead.
 */
export const createPmoCoordinatorSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required.").max(200, "Name is too long."),
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address.").max(255),
});

export type CreatePmoCoordinatorInput = z.infer<typeof createPmoCoordinatorSchema>;

/**
 * Rename and/or change the email. The email decides which PMO Portal account
 * the entry resolves to, so the service only allows changing it while no
 * project is assigned to the current account (same rule as removal).
 * .strict() so an unknown field is rejected rather than silently ignored.
 */
export const updatePmoCoordinatorSchema = z
  .object({
    displayName: z.string().trim().min(1, "Name is required.").max(200, "Name is too long.").optional(),
    email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address.").max(255).optional(),
  })
  .strict()
  .refine((v) => v.displayName !== undefined || v.email !== undefined, {
    message: "Provide a name or an email to update.",
  });

export type UpdatePmoCoordinatorInput = z.infer<typeof updatePmoCoordinatorSchema>;

export const pmoCoordinatorIdParamSchema = z.object({ id: z.string().trim().min(1) });
