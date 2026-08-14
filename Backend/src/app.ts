import cors from "cors";
import express from "express";
import { authRoutes } from "./modules/auth/index.js";
import { userRoutes } from "./modules/users/index.js";
import { projectRoutes } from "./modules/projects/index.js";
import { quantityRoutes } from "./modules/quantity/index.js";
import { milestoneRoutes } from "./modules/milestones/index.js";
import { expenseRoutes } from "./modules/expenses/index.js";
import { employeeRoutes } from "./modules/employees/index.js";
import { resourceRoutes } from "./modules/resources/index.js";
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
// expense.routes.ts follows the exact same shape — its own full paths
// (/projects/:projectId/expenses, /expenses/:id), mounted at root alongside
// the routers above. This is the Other Project Expenses child-collection
// module only — Expense Budget's 5 flat fields ride on projectRoutes above,
// with no separate router of their own.
app.use(expenseRoutes);
// Manpower / Employee Master — Phase 3.7. Declares only relative paths
// (/, /:id, /import), same convention as /users and the base /projects
// routes above, so it's mounted under its own prefix rather than at root.
app.use("/employees", employeeRoutes);
// Project Resource ("Team Assigned") — Phase 3.7, backend-only (see
// resource.routes.ts's own note: no frontend code calls these routes yet).
// Declares its own full paths (/projects/:projectId/resources,
// /employees/:employeeNo/assignments, /resources/:id), mounted at root
// alongside quantity/milestone/expense routes above — its
// /employees/:employeeNo/assignments literal never collides with
// employeeRoutes' /employees/:id above, since Express matches on exact
// segment count/structure, not just a shared prefix.
app.use(resourceRoutes);

app.use((req, _res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
});

app.use(errorHandler);

export default app;
