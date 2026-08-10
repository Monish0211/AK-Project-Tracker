import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { validate } from "../../../shared/middleware/validate.js";
import { createUser, getLookups } from "../controllers/user.controller.js";
import { createUserSchema } from "../validators/user.validators.js";

const router = Router();

// Reference data (role/module/region/approval names + ids) the Add User
// form needs to populate its selectors — any authenticated user with
// access to Settings can load it.
router.get("/lookups", authenticate, getLookups);

// Only Administrator/PMO Manager can provision new portal logins — the
// same two roles the frontend's User Management screen is meant for.
router.post("/", authenticate, authorize("Administrator", "PMO Manager"), validate(createUserSchema), createUser);

export default router;
