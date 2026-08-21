import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as customerService from "../services/customer.service.js";
import { customerIdParamSchema, listCustomersQuerySchema } from "../validators/customer.validators.js";
import type { CreateCustomerInput, ImportCustomersInput, UpdateCustomerInput } from "../validators/customer.validators.js";

function parseCustomerIdParam(req: Request): string {
  const result = customerIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Customer ID is required.", 400);
  }
  return result.data.id;
}

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.createCustomer(req.body as CreateCustomerInput);
  res.status(201).json({ success: true, data: customer, message: "Customer created successfully." });
});

export const importCustomers = asyncHandler(async (req: Request, res: Response) => {
  const result = await customerService.bulkImportCustomers(req.body as ImportCustomersInput);
  res.status(201).json({
    success: true,
    data: result,
    message: `Import complete. Imported ${result.imported} customer(s).`,
  });
});

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const result = listCustomersQuerySchema.safeParse(req.query);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid query parameters.";
    throw new AppError(message, 400);
  }

  const page = await customerService.listCustomers(result.data);
  res.status(200).json({ success: true, data: page });
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.getCustomerById(parseCustomerIdParam(req));
  res.status(200).json({ success: true, data: customer });
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.updateCustomer(parseCustomerIdParam(req), req.body as UpdateCustomerInput);
  res.status(200).json({ success: true, data: customer, message: "Customer updated successfully." });
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  await customerService.deleteCustomer(parseCustomerIdParam(req));
  res.status(200).json({ success: true, data: null, message: "Customer deleted successfully." });
});
