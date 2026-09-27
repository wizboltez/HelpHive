import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import type { Db } from "../db/db.js";
import { me, requireRole } from "../lib/auth.js";
import { today, weekdayOf } from "../lib/dates.js";
import { badRequest, conflict, HttpError, notFound, parse, uuid } from "../lib/http.js";
import { notify } from "../lib/notify.js";
import { BOOKING_SELECT, newDoorCode, openVisit, visitState, type Booking } from "../services/bookings.js";

/**
 * Door-code attendance. Each booked day has a 4-digit code the resident sees.
 * The helper enters it on arrival (check-in) and on leaving (check-out); both mark the day present.
 */
export function visitRoutes(db: Db) {
  const router = Router();

  /** Confirmed bookings with a visit today, for a resident or a helper. */
  function bookingsToday(role: "resident" | "worker", userId: string) {
    const column = role === "resident" ? "b.resident_id" : "b.helper_id";
    const date = today();
    return db.query<Booking>(
      `${BOOKING_SELECT}
       WHERE ${column} = $1 AND b.status = 'confirmed'
         AND $2 BETWEEN b.start_date AND b.end_date AND $3 = ANY(b.days)
       ORDER BY b.start_time`,
      [userId, date, weekdayOf(date)],
    );
  }

  function toVisit(booking: Booking, visit: any, showCode: boolean) {
    return {
      bookingId: booking.id,
      date: visit.visit_date,
      flat: booking.flat,
      startTime: booking.startTime,
      endTime: booking.endTime,
      helper: { id: booking.helperId, name: booking.helperName, slug: booking.helperSlug },
      resident: { id: booking.residentId, name: booking.residentName },
      state: visitState(visit),
      checkInAt: visit.check_in_at,
      checkOutAt: visit.check_out_at,
      ...(showCode && { doorCode: visit.door_code }),
    };
  }

  // Today's visits. Residents also get the door code to read out to the helper.
  router.get("/today", requireRole("resident", "worker"), async (req, res) => {
    const user = me(req);
    const bookings = await bookingsToday(user.role as "resident" | "worker", user.id);
    const visits = [];
    for (const booking of bookings) {
      const visit = await openVisit(db, booking.id, today());
      visits.push(toVisit(booking, visit, user.role === "resident"));
    }
    res.json(visits);
  });

  // Resident issues a fresh code (e.g. after too many wrong attempts).
  router.post("/new-code", requireRole("resident"), async (req, res) => {
    const { bookingId } = parse(z.object({ bookingId: uuid }), req.body);
    const booking = (await bookingsToday("resident", me(req).id)).find((b) => b.id === bookingId);
    if (!booking) throw notFound("Visit today for this booking");

    await openVisit(db, booking.id, today());
    const [visit] = await db.query(
      "UPDATE visits SET door_code = $3, failed_attempts = 0 WHERE booking_id = $1 AND visit_date = $2 RETURNING *",
      [booking.id, today(), newDoorCode()],
    );
    res.json(toVisit(booking, visit, true));
  });

  const codeSchema = z.object({ bookingId: uuid, code: z.string().regex(/^\d{4}$/, "Enter the 4-digit code") });

  for (const action of ["check-in", "check-out"] as const) {
    router.post(`/${action}`, requireRole("worker"), async (req, res) => {
      const input = parse(codeSchema, req.body);
      const booking = (await bookingsToday("worker", me(req).id)).find((b) => b.id === input.bookingId);
      if (!booking) throw notFound("Visit today for this booking");

      const visit = await openVisit(db, booking.id, today());
      if (action === "check-in" && visit.check_in_at) throw conflict("You have already checked in");
      if (action === "check-out" && !visit.check_in_at) throw conflict("Check in first");
      if (action === "check-out" && visit.check_out_at) throw conflict("You have already checked out");
      if (visit.failed_attempts >= config.maxDoorCodeAttempts) {
        throw new HttpError(423, "locked", "Too many wrong codes. Ask the resident for a new code.");
      }

      if (input.code !== visit.door_code) {
        await db.query("UPDATE visits SET failed_attempts = failed_attempts + 1 WHERE id = $1", [visit.id]);
        const attemptsLeft = config.maxDoorCodeAttempts - visit.failed_attempts - 1;
        throw badRequest("Wrong code, try again", { attemptsLeft });
      }

      const column = action === "check-in" ? "check_in_at" : "check_out_at";
      const [updated] = await db.query(
        `UPDATE visits SET ${column} = $2, failed_attempts = 0 WHERE id = $1 RETURNING *`,
        [visit.id, new Date()],
      );
      const title = action === "check-in" ? `${booking.helperName} has arrived` : `${booking.helperName} has left`;
      await notify(db, booking.residentId, title, booking.flat, "/dashboard");
      res.json(toVisit(booking, updated, false));
    });
  }

  return router;
}
