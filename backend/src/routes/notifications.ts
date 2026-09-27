import { Router } from "express";
import type { Db } from "../db/db.js";
import { me } from "../lib/auth.js";
import { parse, uuid } from "../lib/http.js";

/** FR-08: in-app notifications for booking, attendance and leave updates. */
export function notificationRoutes(db: Db) {
  const router = Router();

  router.get("/", async (req, res) => {
    const items = await db.query(
      `SELECT id, title, body, link, read_at IS NOT NULL AS "isRead", created_at AS "createdAt"
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [me(req).id],
    );
    res.json({ unread: items.filter((n) => !n.isRead).length, items });
  });

  router.post("/:id/read", async (req, res) => {
    await db.query("UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL", [
      parse(uuid, req.params.id),
      me(req).id,
    ]);
    res.status(204).end();
  });

  router.post("/read-all", async (req, res) => {
    await db.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [me(req).id]);
    res.status(204).end();
  });

  return router;
}
