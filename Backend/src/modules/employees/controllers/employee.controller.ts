import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as employeeService from "../services/employee.service.js";
import { employeeIdParamSchema, listEmployeesQuerySchema } from "../validators/employee.validators.js";
import type { CreateEmployeeInput, ImportEmployeesInput, UpdateEmployeeInput } from "../validators/employee.validators.js";

// Path params aren't covered by the shared `validate()` middleware (body
// only) — same manual-safeParse convention as project.controller.ts.
function parseEmployeeIdParam(req: Request): string {
  const result = employeeIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Employee ID is required.", 400);
  }
  return result.data.id;
}

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.createEmployee(req.body as CreateEmployeeInput);
  res.status(201).json({ success: true, data: employee, message: "Employee created successfully." });
});

export const importEmployees = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeeService.bulkImportEmployees(req.body as ImportEmployeesInput);
  res.status(201).json({
    success: true,
    data: result,
    message: `Import complete. Added ${result.added}, updated ${result.updated}.`,
  });
});

export const getEmployees = asyncHandler(async (req: Request, res: Response) => {
  // The shared `validate()` middleware only covers req.body — query params
  // are parsed here, same error-shaping convention as a body validation
  // failure (see project.controller.ts's getProjects).
  const result = listEmployeesQuerySchema.safeParse(req.query);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid query parameters.";
    throw new AppError(message, 400);
  }

  const page = await employeeService.listEmployees(result.data);
  res.status(200).json({ success: true, data: page });
});

export const getEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.getEmployeeById(parseEmployeeIdParam(req));
  res.status(200).json({ success: true, data: employee });
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.updateEmployee(parseEmployeeIdParam(req), req.body as UpdateEmployeeInput);
  res.status(200).json({ success: true, data: employee, message: "Employee updated successfully." });
});

export const deleteEmployee = asyncHandler(async (req: Request, res: Response) => {
  await employeeService.deleteEmployee(parseEmployeeIdParam(req));
  res.status(200).json({ success: true, data: null, message: "Employee deleted successfully." });
});
