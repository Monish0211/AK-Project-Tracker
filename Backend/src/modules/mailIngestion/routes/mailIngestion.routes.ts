import { Router } from "express";
import { verifyInternalSecret } from "../../../shared/middleware/verifyInternalSecret.js";
import { triggerPoll } from "../controllers/mailIngestion.controller.js";

const router = Router();

router.post("/internal/timesheets/poll", verifyInternalSecret, triggerPoll);

export default router;
