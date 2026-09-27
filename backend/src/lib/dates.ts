import { config } from "../config.js";

// Calendar dates are plain 'YYYY-MM-DD' strings. "Today" is in the configured timezone (TIMEZONE).

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date());
}

export function addDays(date: string, days: number) {
  return toIso(new Date(toDate(date).getTime() + days * DAY_MS));
}

/** Same day next month, clamped to the month's last day (31 Jan → 28 Feb). */
export function addMonths(date: string, months: number) {
  const d = toDate(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(target);
}

export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[toDate(date).getUTCDay()];
}

/** Every date from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** First and last day of a 'YYYY-MM' month. */
export function monthRange(month: string) {
  const from = `${month}-01`;
  return { from, to: addDays(addMonths(from, 1), -1) };
}

/** A local date + 'HH:MM' time in the configured timezone, as a real instant. */
export function localTime(date: string, time: string) {
  const local = `${date}T${time.slice(0, 5)}:00`;
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${local}Z`))
    .find((part) => part.type === "timeZoneName")!.value; // e.g. "GMT+05:30", or "GMT" for UTC
  return new Date(`${local}${offset === "GMT" ? "Z" : offset.slice(3)}`);
}
