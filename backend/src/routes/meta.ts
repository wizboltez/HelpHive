import { Router } from "express";
import { config } from "../config.js";
import type { Db } from "../db/db.js";
import { CATEGORIES } from "../lib/catalog.js";

/** Public lists the sign-up and profile forms need. No login required. */
export function metaRoutes(db: Db) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const buildings = await db.query<{ name: string }>("SELECT name FROM buildings ORDER BY name");
    res.json({
      buildings: buildings.map((b) => b.name),
      categories: CATEGORIES,
      emailDomains: config.allowedEmailDomains,
    });
  });

  return router;
}
