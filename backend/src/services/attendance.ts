import type { Db } from "../db/db.js";
import { datesBetween, today, weekdayOf } from "../lib/dates.js";

export type DayState = "present" | "absent" | "leave" | "none";

/**
 * A helper's attendance for each day in a range:
 * - present: checked in and out with the door code on at least one visit
 * - leave:   on approved leave
 * - absent:  a visit was booked but never completed (past days only)
 * - none:    nothing booked, or the day hasn't happened yet
 */
export async function attendance(db: Db, helperId: string, from: string, to: string) {
  const bookings = await db.query<{ startDate: string; endDate: string; days: string[] }>(
    `SELECT start_date AS "startDate", end_date AS "endDate", days FROM bookings
     WHERE helper_id = $1 AND status IN ('confirmed', 'completed') AND start_date <= $3 AND end_date >= $2`,
    [helperId, from, to],
  );
  const leaves = await db.query<{ startDate: string; endDate: string }>(
    `SELECT start_date AS "startDate", end_date AS "endDate" FROM helper_leaves
     WHERE helper_id = $1 AND start_date <= $3 AND end_date >= $2`,
    [helperId, from, to],
  );
  const completed = await db.query<{ date: string }>(
    `SELECT DISTINCT v.visit_date AS date FROM visits v JOIN bookings b ON b.id = v.booking_id
     WHERE b.helper_id = $1 AND v.check_out_at IS NOT NULL AND v.visit_date BETWEEN $2 AND $3`,
    [helperId, from, to],
  );
  const presentDates = new Set(completed.map((row) => row.date));
  const now = today();

  const days = datesBetween(from, to).map((date) => {
    const onLeave = leaves.some((l) => l.startDate <= date && date <= l.endDate);
    const booked = bookings.some(
      (b) => b.startDate <= date && date <= b.endDate && b.days.includes(weekdayOf(date)),
    );
    let state: DayState = "none";
    if (presentDates.has(date)) state = "present";
    else if (onLeave) state = "leave";
    else if (booked && date < now) state = "absent";
    return { date, state };
  });

  const count = (state: DayState) => days.filter((d) => d.state === state).length;
  return { days, totals: { present: count("present"), absent: count("absent"), leave: count("leave") } };
}
