import { Router } from "express";
import { config } from "../config.js";
import type { Db } from "../db/db.js";
import { CATEGORIES } from "../lib/catalog.js";
import { expandFlats } from "../lib/flats.js";

/** Public lists the sign-up and profile forms need. No login required. */
export function metaRoutes(db: Db) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const buildings = await db.query<{ name: string; flat_ranges: string }>(
      "SELECT name, flat_ranges FROM buildings ORDER BY name",
    );
    res.json({
      buildings: buildings.map((b) => b.name),
      // Per building: the admin's ranges as typed, and the flats they expand to. No entry = type it in.
      flatRanges: Object.fromEntries(buildings.filter((b) => b.flat_ranges).map((b) => [b.name, b.flat_ranges])),
      flats: Object.fromEntries(buildings.filter((b) => b.flat_ranges).map((b) => [b.name, expandFlats(b.flat_ranges)])),
      categories: CATEGORIES,
      emailDomains: config.allowedEmailDomains,
    });
  });

  return router;
}
