import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "../db/db.js";
import { me, requireRole } from "../lib/auth.js";
import { today, weekdayOf, WEEKDAYS } from "../lib/dates.js";
import { badRequest, clockTime, conflict, forbidden, isoDate, notFound, parse, uuid } from "../lib/http.js";
import { notify } from "../lib/notify.js";
import { planEndDate, priceBooking, visitDates, WEEKDAYS_MON_FRI, type Service } from "../lib/pricing.js";
import {
  BOOKING_SELECT,
  canCancel,
  hasClash,
  lockHelper,
  refreshStatuses,
  withCancellable,
  type Booking,
} from "../services/bookings.js";
import { WORK_HOURS_FIELDS } from "../services/schedule.js";

const bookingSchema = z
  .object({
    helperId: uuid,
    plan: z.enum(["one_time", "weekly", "monthly"]),
    startDate: isoDate,
    days: z.array(z.enum(WEEKDAYS)).min(1).optional(), // ignored for one-time; defaults to Mon–Fri
    startTime: clockTime,
    endTime: clockTime,
    serviceIds: z.array(uuid).default([]),
    notes: z.string().trim().max(500).default(""),
  })
  .refine((b) => b.endTime > b.startTime, { message: "End time must be after start time", path: ["endTime"] });

type BookingInput = z.infer<typeof bookingSchema>;

export function bookingRoutes(db: Db) {
  const router = Router();
  const residentOnly = requireRole("resident");
  const workerOnly = requireRole("worker");

  /** Loads a booking the current user is part of (admins can see all). */
  async function findBooking(req: Request) {
    const id = parse(uuid, req.params.id);
    const [booking] = await db.query<Booking>(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
    const user = me(req);
    if (!booking) throw notFound("Booking");
    if (user.role !== "admin" && user.id !== booking.residentId && user.id !== booking.helperId) {
      throw notFound("Booking");
    }
    return booking;
  }

  // Price preview for the booking card, without saving anything.
  router.post("/quote", residentOnly, async (req, res) => {
    const { quote } = await prepareBooking(db, parse(bookingSchema, req.body));
    res.json(quote);
  });

  // FR-05 / UC-06: resident requests a booking; the helper then accepts or rejects it.
  router.post("/", residentOnly, async (req, res) => {
    const input = parse(bookingSchema, req.body);
    const user = me(req);

    const id = await db.transaction(async (tx) => {
      await lockHelper(tx, input.helperId);
      const { slot, quote } = await prepareBooking(tx, input);
      if (await hasClash(tx, input.helperId, slot)) throw conflict("The helper is already booked at that time");

      const [{ flat }] = await tx.query(
        "SELECT concat_ws(' · ', building, nullif(place, '')) AS flat FROM users WHERE id = $1",
        [user.id],
      );
      const [{ id }] = await tx.query(
        `INSERT INTO bookings (resident_id, helper_id, flat, plan, start_date, end_date, days, start_time, end_time,
                               visits, rate_per_visit, extras, total, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14) RETURNING id`,
        [user.id, input.helperId, flat, input.plan, slot.startDate, slot.endDate, slot.days, slot.startTime,
          slot.endTime, quote.visits, quote.ratePerVisit, JSON.stringify(quote.extras), quote.total, input.notes],
      );
      await notify(tx, input.helperId, "New house request", `${flat} · ${input.plan.replace("_", "-")} plan`, "/worker/requests");
      return id;
    });

    const [booking] = await db.query<Booking>(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
    res.status(201).json(withCancellable(booking));
  });

  // My bookings: a resident's own, a helper's own, or everything for admins.
  router.get("/", async (req, res) => {
    const { status } = parse(
      z.object({ status: z.enum(["pending", "confirmed", "rejected", "cancelled", "completed"]).optional() }),
      req.query,
    );
    await refreshStatuses(db);
    const user = me(req);
    const params: unknown[] = [];
    const where: string[] = [];
    if (user.role === "resident") where.push(`b.resident_id = $${params.push(user.id)}`);
    if (user.role === "worker") where.push(`b.helper_id = $${params.push(user.id)}`);
    if (status) where.push(`b.status = $${params.push(status)}`);

    const bookings = await db.query<Booking>(
      `${BOOKING_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY b.start_date DESC`,
      params,
    );
    res.json(bookings.map(withCancellable));
  });

  // Booking detail plus each scheduled day and what happened on it.
  router.get("/:id", async (req, res) => {
    await refreshStatuses(db);
    const booking = await findBooking(req);
    const visits = await db.query(
      `SELECT visit_date AS date, check_in_at AS "checkInAt", check_out_at AS "checkOutAt"
       FROM visits WHERE booking_id = $1`,
      [booking.id],
    );
    const byDate = new Map(visits.map((v) => [v.date, v]));
    const now = today();
    const schedule = visitDates(booking.startDate, booking.endDate, booking.days).map((date) => {
      const visit = byDate.get(date);
      const state = visit?.checkOutAt ? "done" : visit?.checkInAt ? "inside" : date < now ? "missed" : "upcoming";
      return { date, state, checkInAt: visit?.checkInAt ?? null, checkOutAt: visit?.checkOutAt ?? null };
    });
    res.json({ ...withCancellable(booking), schedule });
  });

  // UC-07: resident cancels (free until 24h before the first visit).
  router.post("/:id/cancel", residentOnly, async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().max(300).default("") }), req.body);
    const booking = await findBooking(req);
    if (!canCancel(booking)) {
      throw conflict("This booking can no longer be cancelled (less than 24 hours before it starts)");
    }
    await db.query("UPDATE bookings SET status = 'cancelled', cancel_reason = $2 WHERE id = $1", [booking.id, reason]);
    await notify(db, booking.helperId, "Booking cancelled", `${booking.residentName} (${booking.flat}) cancelled`, "/worker");
    res.json({ ...booking, status: "cancelled", cancelReason: reason, cancellable: false });
  });

  // UC-08: helper accepts or rejects a request.
  router.post("/:id/accept", workerOnly, async (req, res) => {
    const booking = await findBooking(req);
    if (booking.status !== "pending") throw conflict(`This request is already ${booking.status}`);
    if (booking.startDate < today()) throw conflict("This request has expired");

    await db.transaction(async (tx) => {
      await lockHelper(tx, booking.helperId);
      if (await hasClash(tx, booking.helperId, booking)) {
        throw conflict("You already have a booking at that time");
      }
      await tx.query("UPDATE bookings SET status = 'confirmed' WHERE id = $1", [booking.id]);
      await notify(tx, booking.residentId, "Booking confirmed", `${booking.helperName} accepted your booking`, "/bookings");
    });
    res.json({ ...withCancellable({ ...booking, status: "confirmed" }) });
  });

  router.post("/:id/reject", workerOnly, async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().max(300).default("") }), req.body);
    const booking = await findBooking(req);
    if (booking.status !== "pending") throw conflict(`This request is already ${booking.status}`);

    await db.query("UPDATE bookings SET status = 'rejected', cancel_reason = $2 WHERE id = $1", [booking.id, reason]);
    await notify(db, booking.residentId, "Booking declined", reason || `${booking.helperName} can't take this booking`, "/bookings");
    res.json({ ...booking, status: "rejected", cancelReason: reason, cancellable: false });
  });

  // FR-07: resident reviews a helper after at least one completed visit.
  router.post("/:id/review", residentOnly, async (req, res) => {
    const input = parse(
      z.object({ stars: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).default("") }),
      req.body,
    );
    const booking = await findBooking(req);
    const done = await db.query("SELECT 1 FROM visits WHERE booking_id = $1 AND check_out_at IS NOT NULL", [booking.id]);
    if (!done.length) throw conflict("You can review once at least one visit is completed");

    const existing = await db.query("SELECT 1 FROM reviews WHERE booking_id = $1", [booking.id]);
    if (existing.length) throw conflict("You have already reviewed this booking");

    const [review] = await db.query(
      `INSERT INTO reviews (booking_id, helper_id, resident_id, stars, comment) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, stars, comment, created_at AS "createdAt"`,
      [booking.id, booking.helperId, booking.residentId, input.stars, input.comment],
    );
    await notify(db, booking.helperId, "New review", `${input.stars}★ from ${booking.residentName}`, "/worker/profile");
    res.status(201).json(review);
  });

  return router;
}

/** Validates a booking request against the helper and works out the dates and price. */
async function prepareBooking(db: Db, input: BookingInput) {
  if (input.startDate < today()) throw badRequest("Start date is in the past");

  const [helper] = await db.query(
    `SELECT h.rate_per_visit, h.is_accepting, h.verification, u.is_active, ${WORK_HOURS_FIELDS}
     FROM helpers h JOIN users u ON u.id = h.user_id WHERE h.user_id = $1`,
    [input.helperId],
  );
  if (!helper || helper.verification !== "verified" || !helper.is_active) throw notFound("Helper");
  if (!helper.is_accepting) throw conflict("This helper is not taking new bookings right now");
  if (helper.rate_per_visit <= 0) throw conflict("This helper hasn't set a rate yet");

  const days = input.plan === "one_time" ? [weekdayOf(input.startDate)] : (input.days ?? WEEKDAYS_MON_FRI);
  const endDate = planEndDate(input.plan, input.startDate);
  const dates = visitDates(input.startDate, endDate, days);
  if (!dates.length) throw badRequest("None of the chosen days fall within this plan");

  // The slot must fit inside the helper's working hours.
  const offDays = days.filter((d) => !helper.workDays.includes(d));
  if (offDays.length) throw badRequest(`The helper doesn't work on ${offDays.join(", ")}`);
  if (input.startTime < helper.workStart || input.endTime > helper.workEnd) {
    throw badRequest(`Choose a time within the helper's working hours (${helper.workStart}–${helper.workEnd})`);
  }
  if (input.plan === "one_time") {
    const onLeave = await db.query(
      "SELECT 1 FROM helper_leaves WHERE helper_id = $1 AND $2::date BETWEEN start_date AND end_date",
      [input.helperId, input.startDate],
    );
    if (onLeave.length) throw badRequest("The helper is on leave that day");
  }

  const services = input.serviceIds.length
    ? await db.query<Service>(
        `SELECT id, label, price, unit FROM helper_services
         WHERE helper_id = $1 AND is_available AND id = ANY($2::uuid[])`,
        [input.helperId, input.serviceIds],
      )
    : [];
  if (services.length !== new Set(input.serviceIds).size) {
    throw badRequest("One or more of the chosen services isn't offered by this helper");
  }

  const slot = { startDate: input.startDate, endDate, days, startTime: input.startTime, endTime: input.endTime };
  const quote = { ...slot, ratePerVisit: helper.rate_per_visit, ...priceBooking(dates.length, helper.rate_per_visit, services) };
  return { slot, quote };
}
