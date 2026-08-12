import cors from "cors";
import express from "express";
import { authRoutes } from "./modules/auth/index.js";
import { userRoutes } from "./modules/users/index.js";
import { projectRoutes } from "./modules/projects/index.js";
import { quantityRoutes } from "./modules/quantity/index.js";
import { milestoneRoutes } from "./modules/milestones/index.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { AppError } from "./shared/utils/AppError.js";

const app = express();

// Deployment target is behind a reverse proxy (Hostinger VPS/Nginx) — without
// this, req.ip is always the proxy's address, which would make every audit
// log entry and rate-limit decision meaningless.
app.set("trust proxy", 1);

app.use(cors());
// Default 100kb is too small for a bulk Excel import's JSON payload
// (POST /projects/import can carry hundreds of rows) — every other route's
// payloads are tiny by comparison, so this is a safe, generous ceiling
// rather than a per-route override.
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, data: { status: "ok" } });
});

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/projects", projectRoutes);
// quantity.routes.ts already declares its own full paths
// (/projects/:projectId/quantity, /quantity/:id) — mounted at root rather
// than under a prefix, same as the two routers above share the /projects
// namespace without conflicting.
app.use(quantityRoutes);
// milestone.routes.ts follows the exact same shape — its own full paths
// (/projects/:projectId/milestones[/ingest], /milestones/:id), mounted at
// root alongside the two routers above.
app.use(milestoneRoutes);

app.use((req, _res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
});

app.use(errorHandler);

export default app;
