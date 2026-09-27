import { config } from "../config.js";
import { addDays, addMonths, datesBetween, weekdayOf, type Weekday } from "./dates.js";

export type Plan = "one_time" | "weekly" | "monthly";
export type Service = { id: string; label: string; price: number; unit: "visit" | "event" };
export type Extra = Service & { amount: number };

export function planEndDate(plan: Plan, startDate: string) {
  if (plan === "weekly") return addDays(startDate, 6);
  if (plan === "monthly") return addDays(addMonths(startDate, 1), -1);
  return startDate;
}

/** The dates a helper comes: every day in range that falls on one of the chosen weekdays. */
export function visitDates(startDate: string, endDate: string, days: readonly string[]) {
  return datesBetween(startDate, endDate).filter((date) => days.includes(weekdayOf(date)));
}

/**
 * Price = visits × rate + extras + convenience fee.
 * "visit" extras (e.g. daily chapatis) are charged every visit; "event" extras once.
 */
export function priceBooking(visits: number, ratePerVisit: number, services: Service[]) {
  const extras: Extra[] = services.map((s) => ({
    ...s,
    amount: s.unit === "visit" ? s.price * visits : s.price,
  }));
  const base = visits * ratePerVisit;
  const extrasTotal = extras.reduce((sum, e) => sum + e.amount, 0);
  const fee = config.convenienceFee;
  return { visits, base, extras, fee, total: base + extrasTotal + fee };
}

export const WEEKDAYS_MON_FRI: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
