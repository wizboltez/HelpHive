import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/db.js";
import { me } from "../lib/auth.js";
import { addDays, monthRange, today, WEEKDAYS } from "../lib/dates.js";
import { clockTime, isoDate, notFound, parse, uuid } from "../lib/http.js";
import { attendance } from "../services/attendance.js";
import { weekSchedule, weekStart, WORK_HOURS_FIELDS } from "../services/schedule.js";

/**
 * Helper cards with rating and live status. $1 must be today's date.
 * status: "leave" if on leave today, "booked" if not taking work, else "available".
 */
const HELPER_SELECT = `
  SELECT u.id, h.slug, u.name, h.categories, h.summary, u.building AS area,
         '/uploads/photos/' || h.photo_file AS "photoUrl",
         h.rate_per_visit AS "ratePerVisit", h.verification, ${WORK_HOURS_FIELDS},
         coalesce(r.rating, 0) AS rating, coalesce(r.count, 0) AS "reviewCount",
         CASE WHEN l.on_leave THEN 'leave' WHEN h.is_accepting THEN 'available' ELSE 'booked' END AS status
  FROM helpers h
  JOIN users u ON u.id = h.user_id
  LEFT JOIN LATERAL (
    SELECT round(avg(stars), 1)::float8 AS rating, count(*)::int AS count FROM reviews WHERE helper_id = h.user_id
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT true AS on_leave FROM helper_leaves
    WHERE helper_id = h.user_id AND $1::date BETWEEN start_date AND end_date LIMIT 1
  ) l ON true
  WHERE u.is_active`;

const searchSchema = z.object({
  q: z.string().trim().optional(),
  service: z.string().trim().optional(),
  category: z.string().trim().optional(),
  building: z.string().trim().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  status: z.enum(["available", "booked", "leave"]).optional(),
  // "free on Mon at 08:00" — excludes helpers not working or already booked then
  day: z.enum(WEEKDAYS).optional(),
  time: clockTime.optional(),
});

export function helperRoutes(db: Db) {
  const router = Router();

  // FR-03 / UC-03: search verified helpers.
  router.get("/", async (req, res) => {
    const filters = parse(searchSchema, req.query);
    const params: unknown[] = [today()];
    const param = (value: unknown) => `$${params.push(value)}`;
    const where = ["verification = 'verified'"];

    if (filters.q) {
      const q = param(`%${filters.q}%`);
      where.push(`(name ILIKE ${q} OR summary ILIKE ${q} OR array_to_string(categories, ' ') ILIKE ${q}
        OR EXISTS (SELECT 1 FROM helper_services s WHERE s.helper_id = helper.id AND s.label ILIKE ${q}))`);
    }
    if (filters.service) {
      where.push(`EXISTS (SELECT 1 FROM helper_services s
        WHERE s.helper_id = helper.id AND s.is_available AND s.label ILIKE ${param(`%${filters.service}%`)})`);
    }
    if (filters.category) where.push(`${param(filters.category)} = ANY(categories)`);
    if (filters.building) where.push(`area = ${param(filters.building)}`);
    if (filters.minRating !== undefined) where.push(`rating >= ${param(filters.minRating)}`);
    if (filters.status) where.push(`status = ${param(filters.status)}`);
    if (filters.day && filters.time) {
      where.push(`${param(filters.day)} = ANY("workDays")`);
      where.push(`"workStart" <= ${param(filters.time)} AND "workEnd" > ${param(filters.time)}`);
      where.push(`NOT EXISTS (SELECT 1 FROM bookings b
        WHERE b.helper_id = helper.id AND b.status = 'confirmed' AND b.end_date >= $1
          AND ${param(filters.day)} = ANY(b.days)
          AND b.start_time <= ${param(filters.time)}::time AND b.end_time > ${param(filters.time)}::time)`);
    }

    const helpers = await db.query(
      `SELECT * FROM (${HELPER_SELECT}) helper WHERE ${where.join(" AND ")} ORDER BY rating DESC, name`,
      params,
    );
    res.json(helpers);
  });

  // UC-04: full profile — houses worked, extra services, reviews, hours.
  router.get("/:idOrSlug", async (req, res) => {
    const key = req.params.idOrSlug;
    const column = uuid.safeParse(key).success ? "u.id" : "h.slug";
    const [helper] = await db.query(`${HELPER_SELECT} AND ${column} = $2`, [today(), key]);

    // Unverified profiles are only visible to admins and the helper themself.
    const user = me(req);
    const canSeeUnverified = user.role === "admin" || user.id === helper?.id;
    if (!helper || (helper.verification !== "verified" && !canSeeUnverified)) throw notFound("Helper");

    const [houses, services, reviews, hours, nextLeave] = await Promise.all([
      db.query(
        `SELECT flat, days, to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
         FROM bookings WHERE helper_id = $1 AND status = 'confirmed' ORDER BY start_time`,
        [helper.id],
      ),
      db.query(
        `SELECT id, label, price, unit, is_available AS "isAvailable"
         FROM helper_services WHERE helper_id = $1 ORDER BY label`,
        [helper.id],
      ),
      db.query(
        `SELECT r.stars, r.comment, r.created_at AS "createdAt", u.name AS "residentName", b.flat
         FROM reviews r JOIN users u ON u.id = r.resident_id JOIN bookings b ON b.id = r.booking_id
         WHERE r.helper_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
        [helper.id],
      ),
      db.query(
        `SELECT coalesce(round(extract(epoch FROM sum(v.check_out_at - v.check_in_at)) / 3600), 0)::int AS hours
         FROM visits v JOIN bookings b ON b.id = v.booking_id
         WHERE b.helper_id = $1 AND v.check_out_at IS NOT NULL AND v.visit_date > $2`,
        [helper.id, addDays(today(), -30)],
      ),
      db.query(
        `SELECT start_date AS "startDate", end_date AS "endDate" FROM helper_leaves
         WHERE helper_id = $1 AND end_date >= $2 ORDER BY start_date LIMIT 1`,
        [helper.id, today()],
      ),
    ]);

    res.json({
      ...helper,
      houses,
      services,
      reviews,
      hoursLast30Days: hours[0].hours,
      nextLeave: nextLeave[0] ?? null,
    });
  });

  // Attendance calendar for one month (defaults to this month).
  router.get("/:id/attendance", async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { month } = parse(
      z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM").default(today().slice(0, 7)) }),
      req.query,
    );
    const { from, to } = monthRange(month);
    res.json({ helperId: id, month, ...(await attendance(db, id, from, to)) });
  });

  // Week view: working hours, leave and booked slots for 7 days from `from` (defaults to this Monday).
  router.get("/:id/schedule", async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { from } = parse(z.object({ from: isoDate.default(weekStart()) }), req.query);
    const user = me(req);
    const [helper] = await db.query("SELECT verification FROM helpers WHERE user_id = $1", [id]);
    if (!helper || (helper.verification !== "verified" && user.role !== "admin" && user.id !== id)) {
      throw notFound("Helper");
    }
    res.json(await weekSchedule(db, id, from, user));
  });

  return router;
}
