import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import { env } from "../../../shared/utils/env.js";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  getCustomers,
  importCustomers,
  updateCustomer,
} from "../controllers/customer.controller.js";
import { createCustomerSchema, importCustomersSchema, updateCustomerSchema } from "../validators/customer.validators.js";
import { extractCustomerGstDocument } from "../../customerGst/controllers/customerGst.controller.js";
import { customerGstRateLimit } from "../../customerGst/middleware/customerGstRateLimit.js";

const router = Router();

// memoryStorage — the uploaded GST document is never written to disk here;
// it is read once for Claude extraction and discarded when this request
// ends (see customerGst.controller.ts). fileSize matches
// GST_DOCUMENT_MAX_FILE_SIZE_MB so an oversized upload fails with a clean
// application error rather than being buffered past that point pointlessly.
const gstUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.GST_DOCUMENT_MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// Mounted under /customers in app.ts — every logged-in Portal User with the
// "Customer Master" module grant. Global master data (like Employee Master):
// no project-ownership checks. Administrator does NOT bypass the module gate.
router.get("/", authenticate, requireModuleAccess("Customer Master"), getCustomers);
router.get("/:id", authenticate, requireModuleAccess("Customer Master"), getCustomer);
router.post(
  "/",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Customer Master"),
  validate(createCustomerSchema),
  createCustomer
);
router.post(
  "/import",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Customer Master"),
  validate(importCustomersSchema),
  importCustomers
);
// GST Document Import/Extraction (Sep 2026) — memory-only, never persists a
// Customer row or a Document row; returns a reviewable candidate only. See
// customerGst.controller.ts's own comment. Mounted as a literal path ahead
// of no conflicting :id route (there is no GET/POST /:id collision risk
// here — matches the existing "/import" precedent immediately above).
router.post(
  "/gst-extract",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Customer Master"),
  customerGstRateLimit,
  gstUpload.single("file"),
  extractCustomerGstDocument
);
router.patch(
  "/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Customer Master"),
  validate(updateCustomerSchema),
  updateCustomer
);
router.delete("/:id", authenticate, denyReadOnlyWrites, requireModuleAccess("Customer Master"), deleteCustomer);

export default router;
