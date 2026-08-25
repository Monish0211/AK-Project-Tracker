import { z } from "zod";
import { uuidParamSchema } from "../../../shared/utils/uuidParam.js";

/**
 * Every required field here matches EmployeeModal.tsx's own client-side
 * validation exactly (employeeNo/employeeName/designation/department/
 * location/grade/status required; manhourExpenses/reportingManager
 * optional) — the backend schema exists to enforce the same contract
 * server-side, not to invent new rules the UI doesn't already have.
 * `reportingManager` is optional/nullable here even though the current
 * form requires it for new entries — existing localStorage seed data has
 * blank values for it (see employee.service.ts's legacy migration), and the
 * backend must never reject data the frontend already accepted historically
 * — same "don't invent stricter rules than the UI, never block legacy
 * data" precedent as Quantity's own `assignedTo`.
 */
export const createEmployeeSchema = z.object({
  employeeNo: z.string().trim().min(1, "Employee Number is required."),
  employeeName: z.string().trim().min(1, "Employee Name is required."),
  department: z.string().trim().min(1, "Department is required."),
  designation: z.string().trim().min(1, "Designation is required."),
  reportingManager: z.string().trim().optional().nullable(),
  grade: z.string().trim().min(1, "Employee Grade is required."),
  location: z.string().trim().min(1, "Location is required."),

  manhourExpenses: z.coerce.number().min(0, "Hourly rate cannot be negative.").default(0),

  status: z.enum(["Active", "Inactive"]).default("Active"),

  // Phase 3.7 — new fields, no current UI field on EmployeeModal.tsx prior
  // to this phase; both optional so every existing call site (and the
  // legacy migration of pre-existing localStorage employees, which have
  // neither) keeps working unchanged.
  dateOfJoining: z.coerce.date().optional().nullable(),
  employeeType: z.string().trim().optional().nullable(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

/** Same fields as createEmployeeSchema, all optional — a PATCH only carries what changed. No default on status/manhourExpenses here (unlike create) — omitting them on an update must leave the existing value alone. */
export const updateEmployeeSchema = z.object({
  employeeNo: z.string().trim().min(1).optional(),
  employeeName: z.string().trim().min(1).optional(),
  department: z.string().trim().min(1).optional(),
  designation: z.string().trim().min(1).optional(),
  reportingManager: z.string().trim().optional().nullable(),
  grade: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),

  manhourExpenses: z.coerce.number().min(0, "Hourly rate cannot be negative.").optional(),

  status: z.enum(["Active", "Inactive"]).optional(),

  dateOfJoining: z.coerce.date().optional().nullable(),
  employeeType: z.string().trim().optional().nullable(),
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/**
 * GET /employees query params — parsed directly in the controller (the
 * shared `validate()` middleware only covers req.body), same convention as
 * project.controller.ts's getProjects.
 */
export const listEmployeesQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(10),
  sortField: z
    .enum(["employeeNo", "employeeName", "designation", "department", "grade", "manhourExpenses", "status", "createdAt"])
    .default("employeeNo"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  department: z.string().trim().optional(),
  status: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  location: z.string().trim().optional(),
});

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

/**
 * POST /employees/import — Excel parsing happens client-side (matching the
 * existing importEmployeesFromExcel()'s use of the `xlsx` library, and
 * Projects' own POST /projects/import precedent of parsing in the browser
 * and sending JSON, never a raw file, to the backend). Each row uses this
 * dedicated import schema rather than createEmployeeSchema verbatim,
 * because the existing frontend import intentionally has looser validation
 * than the Add/Edit form (a row missing employeeNo/employeeName is silently
 * counted as "invalid" and skipped, never rejecting the whole file) — see
 * employee.service.ts's importEmployees() for how per-row failures are
 * counted rather than thrown.
 */
export const importEmployeeRowSchema = z.object({
  employeeNo: z.string().trim().min(1),
  employeeName: z.string().trim().min(1),
  department: z.string().trim().optional().default(""),
  designation: z.string().trim().optional().default(""),
  reportingManager: z.string().trim().optional().nullable(),
  grade: z.string().trim().optional().default(""),
  location: z.string().trim().optional().default(""),
  manhourExpenses: z.coerce.number().min(0).default(0),
  status: z.enum(["Active", "Inactive"]).default("Active"),
});

export type ImportEmployeeRowInput = z.infer<typeof importEmployeeRowSchema>;

export const importEmployeesSchema = z.object({
  employees: z.array(importEmployeeRowSchema),
});

export type ImportEmployeesInput = z.infer<typeof importEmployeesSchema>;

// P2-07 — Employee.id is the real UUID surrogate key; employeeNo (a
// business identifier) is never used as this route's :id.
export const employeeIdParamSchema = uuidParamSchema("id", "Employee ID");

export type EmployeeIdParam = z.infer<typeof employeeIdParamSchema>;
