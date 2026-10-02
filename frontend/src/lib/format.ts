import type { Plan } from "./types";

export const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const rupees = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

/** "08:00" → "8:00 AM" */
export function time12(time: string) {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** ISO timestamp → "8:12 AM" in the viewer's timezone */
export const clockOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : "—";

/** "2026-10-06" → "6 Oct" (or "6 Oct 2026" with year) */
export const dateLabel = (date: string, withYear = false) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear && { year: "numeric" }),
  });

/** Local calendar date as YYYY-MM-DD, optionally shifted by days. */
export function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday–Sunday of the current week. */
export function thisWeek() {
  const sinceMonday = (new Date().getDay() + 6) % 7;
  return { from: localDate(-sinceMonday), to: localDate(6 - sinceMonday) };
}

/** {Mon,Tue,Wed,Thu,Fri} → "Mon–Fri", {Mon,Wed} → "Mon, Wed" */
export function daysLabel(days: string[]) {
  const sorted = WEEK.filter((d) => days.includes(d));
  if (sorted.length === 7) return "Daily";
  const first = WEEK.indexOf(sorted[0]!);
  const consecutive = sorted.length > 2 && sorted.every((d, i) => WEEK.indexOf(d) === first + i);
  return consecutive ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(", ");
}

/** Working hours → "Mon–Sat · 8:00 AM – 6:00 PM" */
export const workHoursLabel = (h: { workDays: string[]; workStart: string; workEnd: string }) =>
  `${daysLabel(h.workDays)} · ${time12(h.workStart)} – ${time12(h.workEnd)}`;

/** "2026-10-06" shifted by whole days. */
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const planLabel: Record<Plan, string> = { one_time: "One-time", weekly: "Weekly", monthly: "Monthly" };

export const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** "id_proof" → "ID proof"; "other" documents show the name the helper typed. */
export const docTypes: Record<string, string> = {
  id_proof: "ID proof (Aadhaar, voter ID…)",
  address_proof: "Address proof",
  police_verification: "Police verification",
  other: "Other",
};
export const docName = (doc: { docType: string; docLabel?: string | null }) =>
  doc.docType === "other" && doc.docLabel ? doc.docLabel : (docTypes[doc.docType] ?? doc.docType);

/** "Tower A" + "402" → "Tower A · 402" */
export const addressOf = (user: { building?: string | null; place?: string }) =>
  [user.building, user.place].filter(Boolean).join(" · ");
