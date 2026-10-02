import { randomInt } from "node:crypto";
import { config } from "../config.js";
import type { Db } from "../db/db.js";
import { localTime, today } from "../lib/dates.js";

export type Booking = {
  id: string;
  plan: string;
  flat: string;
  startDate: string;
  endDate: string;
  days: string[];
  startTime: string;
  endTime: string;
  visits: number;
  ratePerVisit: number;
  extras: unknown[];
  total: number;
  status: "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
  notes: string;
  cancelReason: string | null;
  createdAt: string;
  residentId: string;
  residentName: string;
  helperId: string;
  helperName: string;
  helperSlug: string;
};

/** Base query for bookings, with resident and helper names. Append WHERE / ORDER BY. */
export const BOOKING_SELECT = `
  SELECT b.id, b.plan, b.flat, b.start_date AS "startDate", b.end_date AS "endDate", b.days,
         to_char(b.start_time, 'HH24:MI') AS "startTime", to_char(b.end_time, 'HH24:MI') AS "endTime",
         b.visits, b.rate_per_visit AS "ratePerVisit", b.extras, b.total, b.status, b.notes,
         b.cancel_reason AS "cancelReason", b.created_at AS "createdAt",
         b.resident_id AS "residentId", r.name AS "residentName",
         b.helper_id AS "helperId", hu.name AS "helperName", h.slug AS "helperSlug"
  FROM bookings b
  JOIN users r ON r.id = b.resident_id
  JOIN users hu ON hu.id = b.helper_id
  JOIN helpers h ON h.user_id = b.helper_id`;

/** Pending requests can always be cancelled; confirmed ones only until 24h before the first visit. */
export function canCancel(booking: Booking) {
  if (booking.status === "pending") return true;
  if (booking.status !== "confirmed") return false;
  const hoursLeft = (localTime(booking.startDate, booking.startTime).getTime() - Date.now()) / 3_600_000;
  return hoursLeft >= config.cancelWindowHours;
}

export const withCancellable = (booking: Booking) => ({ ...booking, cancellable: canCancel(booking) });

/** Marks finished plans completed and expires requests the helper never answered. */
export async function refreshStatuses(db: Db) {
  const now = today();
  await db.query("UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND end_date < $1", [now]);
  await db.query(
    "UPDATE bookings SET status = 'rejected', cancel_reason = 'Request expired' WHERE status = 'pending' AND start_date < $1",
    [now],
  );
}

/** Serialises booking changes for one helper, so two requests can't grab the same slot at once. */
export async function lockHelper(tx: Db, helperId: string) {
  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [helperId]);
}

type Slot = { startDate: string; endDate: string; days: string[]; startTime: string; endTime: string };

/** Returns true if the helper already has a confirmed booking overlapping this slot. */
export async function hasClash(db: Db, helperId: string, slot: Slot, ignoreBookingId?: string) {
  const rows = await db.query(
    `SELECT 1 FROM bookings
     WHERE helper_id = $1 AND status = 'confirmed'
       AND start_date <= $3 AND end_date >= $2
       AND days && $4::text[]
       AND start_time < $6::time AND end_time > $5::time
       AND ($7::uuid IS NULL OR id <> $7)
     LIMIT 1`,
    [helperId, slot.startDate, slot.endDate, slot.days, slot.startTime, slot.endTime, ignoreBookingId ?? null],
  );
  return rows.length > 0;
}

/** A random 4-digit code, never the same as `previous` (so a used code can't come straight back). */
export function newDoorCode(previous?: string) {
  let code: string;
  do code = randomInt(0, 10_000).toString().padStart(4, "0");
  while (code === previous);
  return code;
}

/** Gets the visit row for a booking on a date, creating it (with a fresh door code) if needed. */
export async function openVisit(db: Db, bookingId: string, date: string) {
  await db.query(
    `INSERT INTO visits (booking_id, visit_date, door_code) VALUES ($1, $2, $3)
     ON CONFLICT (booking_id, visit_date) DO NOTHING`,
    [bookingId, date, newDoorCode()],
  );
  const [visit] = await db.query("SELECT * FROM visits WHERE booking_id = $1 AND visit_date = $2", [bookingId, date]);
  return visit;
}

export function visitState(visit: { check_in_at: Date | null; check_out_at: Date | null }) {
  if (visit.check_out_at) return "done";
  if (visit.check_in_at) return "inside";
  return "awaiting";
}
