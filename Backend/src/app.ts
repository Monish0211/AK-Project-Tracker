import cors from "cors";
import express from "express";
import { authRoutes } from "./modules/auth/index.js";
import { userRoutes } from "./modules/users/index.js";
import { projectRoutes } from "./modules/projects/index.js";
import { quantityRoutes } from "./modules/quantity/index.js";
import { milestoneRoutes } from "./modules/milestones/index.js";
import { invoiceRoutes } from "./modules/invoices/index.js";
import { expenseRoutes } from "./modules/expenses/index.js";
import { employeeRoutes } from "./modules/employees/index.js";
import { customerRoutes } from "./modules/customers/index.js";
import { resourceRoutes } from "./modules/resources/index.js";
import { timesheetRoutes } from "./modules/timesheets/index.js";
import { mailIngestionRoutes } from "./modules/mailIngestion/index.js";
import { pdfImportRoutes } from "./modules/pdfImport/index.js";
import { dashboardRoutes } from "./modules/dashboard/index.js";
import { notificationRoutes } from "./modules/notifications/index.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { requestLogger } from "./shared/middleware/requestLogger.js";
import { AppError } from "./shared/utils/AppError.js";
import { env } from "./shared/utils/env.js";
import projectNoteRoutes from "./modules/projects/routes/projectNote.routes.js";

const app = express();

// Deployment target is behind a reverse proxy (Hostinger VPS/Nginx) — without
// this, req.ip is always the proxy's address, which would make every audit
// log entry and rate-limit decision meaningless.
app.set("trust proxy", 1);

// CORS_ALLOWED_ORIGIN is opt-in (see env.ts's comment) — unset means every
// origin is allowed, exactly as before this line was added. Only set once
// the real production frontend origin is confirmed.
app.use(cors(env.CORS_ALLOWED_ORIGIN ? { origin: env.CORS_ALLOWED_ORIGIN } : undefined));
// Default 100kb is too small for a bulk Excel import's JSON payload
// (POST /projects/import can carry hundreds of rows) — every other route's
// payloads are tiny by comparison, so this is a safe, generous ceiling
// rather than a per-route override.
app.use(express.json({ limit: "5mb" }));

// P2-08 — before every route (including the 404 fallback and /health
// itself, which requestLogger.ts explicitly skips logging for) so every
// real request is covered.
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, data: { status: "ok" } });
});

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
// Project Resource ("Team Assigned") — mounted before /projects so that
// exact literal routes like GET /projects/resources match resourceRoutes
// instead of getting swallowed by projectRoutes' /:id handler.
app.use(resourceRoutes);
app.use("/projects", projectRoutes);
app.use("/projects", projectNoteRoutes);
// quantity.routes.ts already declares its own full paths
// (/projects/:projectId/quantity, /quantity/:id) — mounted at root rather
// than under a prefix, same as the two routers above share the /projects
// namespace without conflicting.
app.use(quantityRoutes);
// milestone.routes.ts follows the exact same shape — its own full paths
// (/projects/:projectId/milestones[/ingest], /milestones/:id), mounted at
// root alongside the two routers above.
app.use(milestoneRoutes);
// invoice.routes.ts follows the exact same shape — its own full paths
// (/projects/:projectId/invoice-items[/ingest],
// /quantity/:quantityItemId/invoice-lines, /invoice-lines/:id), mounted at
// root alongside the routers above.
app.use(invoiceRoutes);
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
// Customer Master — global directory (same architectural role as Employee
// Master / Manpower). Declares only relative paths; mounted under /customers.
// Project.client remains plain text — this module never owns project rows.
app.use("/customers", customerRoutes);
// Timesheet backend — Phase 3.8. Declares its own full paths
// (/timesheets/import, /timesheets/imports[...], /timesheets/entries[...]),
// mounted at root alongside quantity/milestone/expense/resource routes
// above. Team Assigned's live UI is untouched by this phase — it continues
// to compute everything from raw localStorage Timesheet data exactly as it
// does today; nothing here is called by the frontend yet.
app.use(timesheetRoutes);
// Microsoft Graph / KEKA mailbox polling — Phase 3.8. A single internal,
// shared-secret-protected route (POST /internal/timesheets/poll), never
// reachable by a logged-in Portal User or the frontend. Not yet verified
// against a real Microsoft Entra tenant — see graphAuth.service.ts.
app.use(mailIngestionRoutes);
// PDF Import AI-assist (Claude) — declares its own full path
// (/pdf-import/ai-extract), mounted at root alongside the routers above.
// Authenticated, user-triggered ONLY: the frontend calls this once per
// selected PDF, sequentially, and only when the user has explicitly
// checked "Use Claude AI for enhanced extraction" in the PDF Import modal
// — never automatically based on OCR confidence (see pdfImportService.ts).
app.use(pdfImportRoutes);
// Dashboard aggregations — Phase 2. Declares its own full path
// (GET /dashboard/summary), mounted at root like timesheet/pdfImport.
// Read-only; authenticate + requireModuleAccess("Dashboard"); ownership
// matches GET /projects. Does not change any other module.
app.use(dashboardRoutes);
// Notification infrastructure — Priority #6, Phase 2. Declares its own full
// paths (/notifications[...], /notifications/push-subscriptions[...]),
// mounted at root like dashboard/timesheet above. INFRASTRUCTURE ONLY: no
// business module calls notification.service.ts's notify() yet (Phase 3).
app.use(notificationRoutes);

app.use((req, _res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
});

app.use(errorHandler);

export default app;
