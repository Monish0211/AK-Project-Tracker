import { z } from "zod";

/**
 * Every required field here matches validateGeneralTab() in
 * frontend/src/utils/projectValidation.ts exactly — the frontend already
 * blocks Save/Save & Next until these pass client-side, so the backend
 * schema exists to enforce the same contract server-side, not to invent new
 * rules the UI doesn't already have.
 */
export const createProjectSchema = z.object({
  poMonth: z.string().trim().min(1, "PO Month is required."),
  prCategory: z.string().trim().min(1, "PR Category is required."),
  prNo: z.string().trim().min(1, "PR Number is required."),
  client: z.string().trim().min(1, "Client Name is required."),
  department: z.string().trim().min(1, "Department is required."),
  domesticForeign: z.string().trim().min(1, "Domestic / Foreign is required."),
  projectTitle: z.string().trim().min(1, "Project Title is required."),

  workOrderStatus: z.string().trim().min(1, "Work Order Status is required."),
  projectStartDate: z.coerce.date(),
  projectEndDate: z.coerce.date().optional().nullable(),
  projectStatus: z.string().trim().min(1, "Project Status is required."),

  actualCompletionDate: z.coerce.date().optional().nullable(),
  completionRemarks: z.string().trim().min(1).optional().nullable(),
  completedBy: z.string().trim().min(1).optional().nullable(),
  completedTimestamp: z.coerce.date().optional().nullable(),

  workOrderNumber: z.string().trim().min(1, "Work Order Number is required."),
  workOrderDate: z.coerce.date(),
  eicName: z.string().trim().min(1, "EIC Name is required."),
  contactNumber: z.string().trim().min(1).optional().nullable(),
  emailId: z.string().trim().email("Enter a valid email address.").optional().nullable(),

  estimatedDuration: z.coerce.number().int().positive().optional().nullable(),
  durationUnit: z.enum(["Days", "Weeks", "Months"]).optional().nullable(),

  contractType: z.string().trim().min(1, "Contract Type is required.").default("LUMP SUM"),
  pmoCoordinator: z.string().trim().min(1, "PMO Coordinator is required."),

  // Payment Milestones — project-wide toggle, not per-milestone data (see
  // Backend/src/modules/milestones). Defaults to "Single" so existing
  // frontend callers that don't yet send this field keep working
  // unchanged, same technique as contractType's own default above.
  paymentType: z.enum(["Single", "Multiple"]).default("Single"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Same fields as createProjectSchema, all optional — a PATCH only needs to
 * carry the fields that changed. contractType keeps no default here (unlike
 * create) since omitting it on an update must leave the existing value
 * alone, not silently reset it to "LUMP SUM".
 */
export const updateProjectSchema = z.object({
  poMonth: z.string().trim().min(1).optional(),
  prCategory: z.string().trim().min(1).optional(),
  prNo: z.string().trim().min(1).optional(),
  client: z.string().trim().min(1).optional(),
  department: z.string().trim().min(1).optional(),
  domesticForeign: z.string().trim().min(1).optional(),
  projectTitle: z.string().trim().min(1).optional(),

  workOrderStatus: z.string().trim().min(1).optional(),
  projectStartDate: z.coerce.date().optional(),
  projectEndDate: z.coerce.date().optional().nullable(),
  projectStatus: z.string().trim().min(1).optional(),

  actualCompletionDate: z.coerce.date().optional().nullable(),
  completionRemarks: z.string().trim().min(1).optional().nullable(),
  completedBy: z.string().trim().min(1).optional().nullable(),
  completedTimestamp: z.coerce.date().optional().nullable(),

  workOrderNumber: z.string().trim().min(1).optional(),
  workOrderDate: z.coerce.date().optional(),
  eicName: z.string().trim().min(1).optional(),
  contactNumber: z.string().trim().min(1).optional().nullable(),
  emailId: z.string().trim().email("Enter a valid email address.").optional().nullable(),

  estimatedDuration: z.coerce.number().int().positive().optional().nullable(),
  durationUnit: z.enum(["Days", "Weeks", "Months"]).optional().nullable(),

  contractType: z.string().trim().min(1).optional(),
  pmoCoordinator: z.string().trim().min(1).optional(),

  // No default here (unlike create) — omitting it on an update must leave
  // the existing value alone, not silently reset it to "Single".
  paymentType: z.enum(["Single", "Multiple"]).optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/**
 * GET /projects query params — parsed directly in the controller (the
 * shared `validate()` middleware only covers req.body), same error-shaping
 * convention as a body validation failure.
 */
export const listProjectsQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(10),
  sortField: z
    .enum(["prNo", "client", "projectTitle", "department", "projectStatus", "projectStartDate", "createdAt"])
    .default("prNo"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  projectStatus: z.string().trim().optional(),
  department: z.string().trim().optional(),
  client: z.string().trim().optional(),
  // region is an alias for prCategory (see schema.prisma's Project model
  // comment) — accepted as a separate query param so the frontend's
  // "Region" filter doesn't need to know it's the same underlying column.
  region: z.string().trim().optional(),
  prCategory: z.string().trim().optional(),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

/**
 * POST /projects/import — bulk Excel import. Each row is validated by the
 * exact same createProjectSchema a single POST /projects uses, so a row
 * that would be accepted one at a time is guaranteed to be accepted here
 * too, and vice versa — no separate, potentially-drifting validation rules
 * for the bulk path.
 */
export const importProjectsSchema = z.object({
  projects: z.array(createProjectSchema).min(1, "At least one project is required."),
});

export type ImportProjectsInput = z.infer<typeof importProjectsSchema>;
