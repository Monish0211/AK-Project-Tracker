import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  accountsApprove,
  deleteDraftPRRequest,
  getApprovalsQueue,
  getMyPRRequests,
  getPRRequestDetail,
  pmoManagerApprove,
  rejectPRRequest,
  saveDraftPRRequest,
  sendToAccounts,
  updatePRRequestProjectData,
} from "../controllers/prRequest.controller.js";
import {
  approveRemarksSchema,
  rejectPRRequestSchema,
  saveDraftPRRequestSchema,
  sendToAccountsSchema,
} from "../validators/prRequest.validators.js";

const router = Router();

// Every route requires a logged-in Portal User with the "Approvals" module
// grant — the one module gating this entire feature area (submit, track
// your own requests, and the approval queue alike), same shape as every
// other module-gated route file. Fine-grained "may THIS caller act on THIS
// specific request" authorization is checked one layer deeper, inside each
// service function (see prRequest.service.ts) — same two-layer pattern as
// Projects' project-ownership checks.
//
// Registered BEFORE "/:id" below, same reasoning as project.routes.ts's
// "/status-counts" — these are single, literal path segments that would
// otherwise be swallowed by "/:id".
router.get("/pr-requests/mine", authenticate, requireModuleAccess("Approvals"), getMyPRRequests);
router.get("/pr-requests/queue", authenticate, requireModuleAccess("Approvals"), getApprovalsQueue);

// Draft CRUD — General/Quantity/Payments/Expense Budget only, same shape as
// Add Project's own form (see prRequestProjectDataSchema). Nothing here ever
// notifies an approver; that only happens via sendToAccounts() below.
router.post(
  "/pr-requests",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Approvals"),
  validate(saveDraftPRRequestSchema),
  saveDraftPRRequest
);
router.get("/pr-requests/:id", authenticate, requireModuleAccess("Approvals"), getPRRequestDetail);
// PATCH is reachable by two different callers, enforced inside the service
// (updatePRRequestProjectData): the requester while status is still "Draft",
// OR whoever is the currently assigned approver for the request's CURRENT
// pending stage — letting Accounts/PMO Manager correct data while reviewing
// it, before deciding Approve/Reject, instead of only being able to reject
// and ask for a full resubmission.
router.patch(
  "/pr-requests/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Approvals"),
  validate(saveDraftPRRequestSchema),
  updatePRRequestProjectData
);
router.delete("/pr-requests/:id", authenticate, denyReadOnlyWrites, requireModuleAccess("Approvals"), deleteDraftPRRequest);
// Send to Accounts — the real submission action, deliberately separate from
// the Draft form above. This is where the requester picks the Assigned
// Accounts Approver and the Assigned PMO Manager (neither is a field inside
// the form itself) and where the approval chain actually starts.
router.post(
  "/pr-requests/:id/send-to-accounts",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Approvals"),
  validate(sendToAccountsSchema),
  sendToAccounts
);
router.post(
  "/pr-requests/:id/accounts-approve",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Approvals"),
  validate(approveRemarksSchema),
  accountsApprove
);
router.post(
  "/pr-requests/:id/pmo-approve",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Approvals"),
  validate(approveRemarksSchema),
  pmoManagerApprove
);
router.post(
  "/pr-requests/:id/reject",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Approvals"),
  validate(rejectPRRequestSchema),
  rejectPRRequest
);

export default router;
