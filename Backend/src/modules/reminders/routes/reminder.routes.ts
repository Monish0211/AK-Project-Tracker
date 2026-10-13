import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites, denyReadOnlyWritesExceptAssignedCoordinator } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createReminder,
  deleteReminder,
  getAllReminders,
  getRemindersByProject,
  updateReminder,
} from "../controllers/reminder.controller.js";
import { createReminderSchema, updateReminderSchema } from "../validators/reminder.validators.js";

const router = Router();

// Same access rule as Projects/Milestones/Notes — every logged-in Portal
// User with the "Projects" module grant (Reminders is a project
// sub-resource, not its own module). Project-ownership authorization is
// checked one layer deeper, inside each service function.
router.get("/reminders", authenticate, requireModuleAccess("Projects"), getAllReminders);
router.get("/projects/:projectId/reminders", authenticate, requireModuleAccess("Projects"), getRemindersByProject);
router.post(
  "/projects/:projectId/reminders",
  authenticate,
  denyReadOnlyWritesExceptAssignedCoordinator({ param: "projectId" }),
  requireModuleAccess("Projects"),
  validate(createReminderSchema),
  createReminder
);
router.patch(
  "/reminders/:id",
  authenticate,
  denyReadOnlyWritesExceptAssignedCoordinator({ child: "projectReminder" }),
  requireModuleAccess("Projects"),
  validate(updateReminderSchema),
  updateReminder
);
router.delete("/reminders/:id", authenticate, denyReadOnlyWritesExceptAssignedCoordinator({ child: "projectReminder" }), requireModuleAccess("Projects"), deleteReminder);

export default router;
