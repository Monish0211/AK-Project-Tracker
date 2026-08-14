import { z } from "zod";

/**
 * Phase 3.7 — backend-only, ready for a future Timesheet integration (see
 * schema.prisma's ProjectResource model comment). `hourlyRateSnapshot` is a
 * REQUIRED input here, not server-derived — the caller (the future
 * Timesheet import process, which already resolves an employee's current
 * rate from Employee Master before computing anything, exactly like
 * frontend/src/services/timesheetProcessingService.ts's rateForEmployee()
 * does today) is responsible for resolving it; this endpoint's only job is
 * to freeze whatever it's given and never re-derive it later. `manhourCost`
 * is never accepted from a client — always `totalHours * hourlyRateSnapshot`,
 * computed in resource.service.ts, same convention as QuantityItem.woValue.
 */
export const createResourceSchema = z.object({
  employeeNo: z.string().trim().min(1, "Employee Number is required."),

  assignmentStartDate: z.coerce.date().optional().nullable(),
  assignmentEndDate: z.coerce.date().optional().nullable(),
  assignmentStatus: z.enum(["Active", "Released"]).default("Active"),

  hourlyRateSnapshot: z.coerce.number().min(0, "Hourly Rate cannot be negative."),

  workingDays: z.coerce.number().min(0, "Working Days cannot be negative.").default(0),
  totalHours: z.coerce.number().min(0, "Total Hours cannot be negative.").default(0),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;

/**
 * Same fields as createResourceSchema minus employeeNo (an assignment is
 * never reassigned to a different employee — remove and recreate instead),
 * all optional — a PATCH only carries what changed. `hourlyRateSnapshot` is
 * updatable here deliberately (e.g. a future re-sync correcting an earlier
 * import), but is never auto-recomputed from a fresh Employee read anywhere
 * in this module.
 */
export const updateResourceSchema = z.object({
  assignmentStartDate: z.coerce.date().optional().nullable(),
  assignmentEndDate: z.coerce.date().optional().nullable(),
  assignmentStatus: z.enum(["Active", "Released"]).optional(),

  hourlyRateSnapshot: z.coerce.number().min(0, "Hourly Rate cannot be negative.").optional(),

  workingDays: z.coerce.number().min(0, "Working Days cannot be negative.").optional(),
  totalHours: z.coerce.number().min(0, "Total Hours cannot be negative.").optional(),
});

export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

/**
 * Path-param validation — the shared `validate()` middleware only covers
 * req.body (same manual-safeParse convention as quantity.validators.ts).
 */
export const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required."),
});
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

export const resourceIdParamSchema = z.object({
  id: z.string().trim().min(1, "Resource ID is required."),
});
export type ResourceIdParam = z.infer<typeof resourceIdParamSchema>;

export const employeeNoParamSchema = z.object({
  employeeNo: z.string().trim().min(1, "Employee Number is required."),
});
export type EmployeeNoParam = z.infer<typeof employeeNoParamSchema>;
