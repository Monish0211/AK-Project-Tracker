import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../shared/middleware/denyReadOnlyWrites.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";
import { requireUser } from "../../shared/utils/requireUser.js";
import * as service from "./adminControls.service.js";

/**
 * Settings > Administrative Controls. Deliberately no role middleware: the service decides (an active Administrator, never on yourself) so that a
 * refused attempt can be written to the audit log instead of being turned away silently.
 */
const router = Router();

const setRightSchema = z.object({
  right: z.string().trim().min(1, "right is required."),
  granted: z.boolean({ error: "granted must be true or false." }),
  reason: z.string().trim().min(5, "A reason of at least 5 characters is required.").max(500, "Reason cannot exceed 500 characters."),
});

router.get(
  "/admin-controls",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ success: true, data: await service.getOverview(requireUser(req)) });
  })
);

router.get(
  "/admin-controls/me",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ success: true, data: await service.getMyRights(requireUser(req)) });
  })
);

router.put(
  "/admin-controls/users/:userId/rights",
  authenticate,
  denyReadOnlyWrites,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = setRightSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    const userId = String(req.params["userId"] ?? "");
    res.status(200).json({ success: true, data: await service.setRight(requireUser(req), userId, parsed.data) });
  })
);

export default router;
