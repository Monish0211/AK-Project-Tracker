import cors from "cors";
import express from "express";
import { authRoutes } from "./modules/auth/index.js";
import { userRoutes } from "./modules/users/index.js";
import { projectRoutes } from "./modules/projects/index.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { AppError } from "./shared/utils/AppError.js";

const app = express();

// Deployment target is behind a reverse proxy (Hostinger VPS/Nginx) — without
// this, req.ip is always the proxy's address, which would make every audit
// log entry and rate-limit decision meaningless.
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, data: { status: "ok" } });
});

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/projects", projectRoutes);

app.use((req, _res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
});

app.use(errorHandler);

export default app;
