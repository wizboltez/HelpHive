import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import type { Db } from "./db/db.js";
import { requireAuth, requireRole } from "./lib/auth.js";
import { errorHandler } from "./lib/http.js";
import { uploadPath } from "./lib/uploads.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { bookingRoutes } from "./routes/bookings.js";
import { complaintRoutes } from "./routes/complaints.js";
import { helperRoutes } from "./routes/helpers.js";
import { metaRoutes } from "./routes/meta.js";
import { notificationRoutes } from "./routes/notifications.js";
import { visitRoutes } from "./routes/visits.js";
import { workerRoutes } from "./routes/worker.js";

export function createApp(db: Db) {
  const app = express();
  app.set("trust proxy", config.trustProxy);
  // Allow the frontend (another origin) to load helper photos.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "100kb" }));

  const auth = requireAuth(db);
  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.authRateLimit, standardHeaders: true });

  app.get("/api/health", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  });
  app.use("/uploads/photos", express.static(uploadPath("photos"), { fallthrough: false, dotfiles: "allow" }));

  app.use("/api/auth/login", authLimit);
  app.use("/api/auth/register", authLimit);
  app.use("/api/auth", authRoutes(db));
  app.use("/api/meta", metaRoutes(db));
  app.use("/api/helpers", auth, helperRoutes(db));
  app.use("/api/worker", auth, requireRole("worker"), workerRoutes(db));
  app.use("/api/bookings", auth, bookingRoutes(db));
  app.use("/api/visits", auth, visitRoutes(db));
  app.use("/api/notifications", auth, notificationRoutes(db));
  app.use("/api/complaints", auth, complaintRoutes(db));
  app.use("/api/admin", auth, requireRole("admin"), adminRoutes(db));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
  });
  app.use(errorHandler);
  return app;
}
