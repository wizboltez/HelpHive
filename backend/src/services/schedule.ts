import type { Db } from "../db/db.js";
import { addDays, datesBetween, today, weekdayOf, WEEKDAYS } from "../lib/dates.js";

/** A helper's regular working hours, for SELECTs that join `helpers h`. */
export const WORK_HOURS_FIELDS = `h.work_days AS "workDays", to_char(h.work_start, 'HH24:MI') AS "workStart",
  to_char(h.work_end, 'HH24:MI') AS "workEnd"`;

export type WorkHours = { workDays: string[]; workStart: string; workEnd: string };

/** Monday of the week containing `date`. */
export function weekStart(date = today()) {
  return addDays(date, -((WEEKDAYS.indexOf(weekdayOf(date)) + 6) % 7));
}

/**
 * Seven days of a helper's schedule from `from`: working hours, leave and the booked slots.
 * The helper (and admins) see which flat each slot is for and their pending requests;
 * residents see other people's slots only as "Booked", plus their own requests.
 */
export async function weekSchedule(db: Db, helperId: string, from: string, viewer: { id: string; role: string }) {
  const to = addDays(from, 6);
  const [[hours], bookings, leaves] = await Promise.all([
    db.query<WorkHours>(`SELECT ${WORK_HOURS_FIELDS} FROM helpers h WHERE h.user_id = $1`, [helperId]),
    db.query(
      `SELECT resident_id AS "residentId", flat, status, days, start_date AS "startDate", end_date AS "endDate",
              to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
       FROM bookings
       WHERE helper_id = $1 AND status IN ('confirmed', 'pending') AND start_date <= $3 AND end_date >= $2
       ORDER BY start_time`,
      [helperId, from, to],
    ),
    db.query(
      `SELECT start_date AS "startDate", end_date AS "endDate" FROM helper_leaves
       WHERE helper_id = $1 AND start_date <= $3 AND end_date >= $2`,
      [helperId, from, to],
    ),
  ]);

  const seesDetails = viewer.role === "admin" || viewer.id === helperId;
  const days = datesBetween(from, to).map((date) => {
    const weekday = weekdayOf(date);
    const slots = bookings
      .filter((b) => b.startDate <= date && date <= b.endDate && b.days.includes(weekday))
      .filter((b) => b.status === "confirmed" || seesDetails || b.residentId === viewer.id)
      .map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        label: seesDetails ? b.flat : b.residentId === viewer.id ? "Your booking" : "Booked",
      }));
    const onLeave = leaves.some((l) => l.startDate <= date && date <= l.endDate);
    return { date, weekday, working: hours.workDays.includes(weekday), onLeave, slots };
  });

  return { ...hours, from, to, days };
}
