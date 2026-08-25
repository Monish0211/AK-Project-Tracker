import { z } from "zod";
import { uuidParamSchema } from "../../../shared/utils/uuidParam.js";

/**
 * Phase 3.7 — backend-only, ready for a future Timesheet integration (see
 * schema.prisma's ProjectResource model comment).
 *
 * P2-09 (security/data-integrity fix) — `hourlyRateSnapshot` is deliberately
 * NOT accepted here. It used to be, on the theory that "the caller" would
 * always be an internal, already-rate-resolving process — but this route is
 * reachable by any authenticated Portal User with the Projects module grant
 * (see resource.routes.ts's own comment), not restricted to such a caller,
 * so a client could set an arbitrary financial figure that flows straight
 * into manhourCost / Dashboard's totalActualProjectCost. The schema's own
 * comment on ProjectResource.hourlyRateSnapshot is the authoritative
 * business rule: "Frozen at row creation/update time from
 * Employee.manhourExpenses — never re-derived from a later Employee read."
 * resource.service.ts's createResourceForProject() now resolves it
 * server-side from Employee Master at creation time — the exact same
 * pattern timesheets/services/projectResource.service.ts's P1-04-hardened
 * recomputeProjectResource() already uses for the automatic sync path.
 * Any hourlyRateSnapshot field a client sends here is silently ignored
 * (plain zod object, no .strict() — unrecognized keys are dropped).
 * `manhourCost` is never accepted from a client either — always
 * `totalHours * hourlyRateSnapshot`, computed in resource.service.ts, same
 * convention as QuantityItem.woValue.
 */
export const createResourceSchema = z.object({
  employeeNo: z.string().trim().min(1, "Employee Number is required."),

  assignmentStartDate: z.coerce.date().optional().nullable(),
  assignmentEndDate: z.coerce.date().optional().nullable(),
  assignmentStatus: z.enum(["Active", "Released"]).default("Active"),

  workingDays: z.coerce.number().min(0, "Working Days cannot be negative.").default(0),
  totalHours: z.coerce.number().min(0, "Total Hours cannot be negative.").default(0),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;

/**
 * Same fields as createResourceSchema minus employeeNo (an assignment is
 * never reassigned to a different employee — remove and recreate instead),
 * all optional — a PATCH only carries what changed.
 *
 * P2-09 — `hourlyRateSnapshot` is NOT accepted here either, for the same
 * reason as createResourceSchema above, and per the schema's own "frozen...
 * never re-derived" rule: an existing row's rate must never change via this
 * endpoint, matching recomputeProjectResource()'s proven updateData, which
 * deliberately omits hourlyRateSnapshot from every ordinary update. There is
 * no re-sync/correction override anywhere in the authoritative code this
 * mirrors — if one is ever needed, it requires its own explicit business
 * decision, not silent client control of this field.
 */
export const updateResourceSchema = z.object({
  assignmentStartDate: z.coerce.date().optional().nullable(),
  assignmentEndDate: z.coerce.date().optional().nullable(),
  assignmentStatus: z.enum(["Active", "Released"]).optional(),

  workingDays: z.coerce.number().min(0, "Working Days cannot be negative.").optional(),
  totalHours: z.coerce.number().min(0, "Total Hours cannot be negative.").optional(),
});

export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

/**
 * P2-02 — GET /projects/resources query. Both fields are optional and
 * default to undefined (not a page-1 default) specifically so an existing
 * caller that sends neither param keeps getting today's exact
 * full-fetch-with-safety-cap behavior (see resource.service.ts's
 * listAllAuthorizedResources()) — only a caller that explicitly asks for a
 * page gets the paginated response shape. pageSize's 2000 ceiling matches
 * this module's own RESOURCE_FETCH_CAP order of magnitude reasoning, not an
 * arbitrary number.
 */
export const listResourcesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(2000, "pageSize cannot exceed 2000.").optional(),
});
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;

/**
 * Path-param validation — the shared `validate()` middleware only covers
 * req.body (same manual-safeParse convention as quantity.validators.ts).
 */
// P2-07 — Project.id/ProjectResource.id are real UUID surrogate keys.
// employeeNoParamSchema below is deliberately UNCHANGED — employeeNo is a
// genuine business identifier (Employee Master's natural key), never a UUID.
export const projectIdParamSchema = uuidParamSchema("projectId", "Project ID");
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

export const resourceIdParamSchema = uuidParamSchema("id", "Resource ID");
export type ResourceIdParam = z.infer<typeof resourceIdParamSchema>;

export const employeeNoParamSchema = z.object({
  employeeNo: z.string().trim().min(1, "Employee Number is required."),
});
export type EmployeeNoParam = z.infer<typeof employeeNoParamSchema>;
