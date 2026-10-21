import { Router } from "express";
import type { Db } from "../db/db.js";
import { me } from "../lib/auth.js";
import { config } from "../config.js";
import { parse, uuid } from "../lib/http.js";

function localDateTime(date: Date) {
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(date),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: config.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date),
  };
}

/** FR-08: in-app notifications for booking, attendance and leave updates. */
export function notificationRoutes(db: Db) {
  const router = Router();

  router.get("/", async (req, res) => {
    const user = me(req);
    if (user.role === "worker") {
      const now = new Date();
      const from = localDateTime(now);
      const until = localDateTime(new Date(now.getTime() + 30 * 60_000));
      await db.query(
        `WITH due AS (
           SELECT b.id AS booking_id, b.helper_id, scheduled.visit_date::date AS visit_date,
                  b.flat, r.name AS resident_name, b.start_time
           FROM bookings b
           JOIN users r ON r.id = b.resident_id
           CROSS JOIN LATERAL generate_series(b.start_date, b.end_date, interval '1 day') AS scheduled(visit_date)
           WHERE b.helper_id = $1 AND b.status = 'confirmed'
             AND scheduled.visit_date::date BETWEEN $2::date AND $4::date
             AND EXTRACT(ISODOW FROM scheduled.visit_date)::int IN (
               SELECT CASE weekday
                 WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3
                 WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 WHEN 'Sun' THEN 7
               END
               FROM unnest(b.days) AS weekdays(weekday)
             )
             AND scheduled.visit_date + b.start_time BETWEEN $2::date + $3::time
                 AND $4::date + $5::time
             AND NOT EXISTS (
               SELECT 1 FROM visits v
               WHERE v.booking_id = b.id AND v.visit_date = scheduled.visit_date::date
                 AND v.check_in_at IS NOT NULL
             )
         ),
         claimed AS (
           INSERT INTO work_reminders (booking_id, visit_date)
           SELECT booking_id, visit_date FROM due
           ON CONFLICT DO NOTHING
           RETURNING booking_id, visit_date
         )
         INSERT INTO notifications (user_id, title, body, link)
         SELECT due.helper_id, 'Upcoming work',
                due.resident_name || ' · ' || due.flat || ' at ' || to_char(due.start_time, 'FMHH12:MI AM'),
                '/worker/work'
         FROM due
         JOIN claimed USING (booking_id, visit_date)`,
        [user.id, from.date, from.time, until.date, until.time],
      );
    }

    const items = await db.query(
      `SELECT id, title, body, link, read_at IS NOT NULL AS "isRead", created_at AS "createdAt"
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [user.id],
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
