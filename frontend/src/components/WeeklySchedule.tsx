import { Clock } from "lucide-react";
import { useState } from "react";
import { dateLabel, localDate, shiftDate, thisWeek, time12, workHoursLabel } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Schedule } from "@/lib/types";
import { ui } from "./Page";

const minutes = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};
const asTime = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

type Slot = Schedule["days"][number]["slots"][number];

/** Gaps inside working hours that no slot covers. */
function freeGaps(slots: Slot[], workStart: string, workEnd: string) {
  const gaps: { startTime: string; endTime: string }[] = [];
  let cursor = minutes(workStart);
  for (const slot of [...slots].sort((a, b) => minutes(a.startTime) - minutes(b.startTime))) {
    if (minutes(slot.startTime) > cursor) gaps.push({ startTime: asTime(cursor), endTime: slot.startTime });
    cursor = Math.max(cursor, minutes(slot.endTime));
  }
  if (cursor < minutes(workEnd)) gaps.push({ startTime: asTime(cursor), endTime: workEnd });
  return gaps;
}

/**
 * A helper's week: working hours as a bar per day, with booked slots marked on it,
 * days off and leave greyed out, and the free gaps written underneath.
 */
export function WeeklySchedule({ helperId, title = "Weekly schedule" }: { helperId: string; title?: string }) {
  const [from, setFrom] = useState(thisWeek().from);
  const { data } = useApi<Schedule>(`/helpers/${helperId}/schedule?from=${from}`);
  const today = localDate();

  const start = data ? minutes(data.workStart) : 0;
  const span = data ? minutes(data.workEnd) - start : 1;
  const at = (time: string) => `${((minutes(time) - start) / span) * 100}%`;
  // Hour marks along the top, every 1–3 hours depending on how long the day is.
  const step = span > 12 * 60 ? 180 : span > 6 * 60 ? 120 : 60;
  const ticks = data
    ? Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => asTime(Math.ceil(start / 60) * 60 + i * step)).filter(
        (t) => minutes(t) <= minutes(data.workEnd),
      )
    : [];

  return (
    <div className={ui.card}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="mr-auto font-display text-lg font-semibold tracking-tight">{title}</h4>
        <button onClick={() => setFrom(shiftDate(from, -7))} aria-label="Previous week" className="grid size-8 place-items-center rounded-lg ring-1 ring-line hover:bg-ink/5">
          ‹
        </button>
        <span className="min-w-32 text-center font-mono text-xs">
          {dateLabel(from)} – {dateLabel(shiftDate(from, 6))}
        </span>
        <button onClick={() => setFrom(shiftDate(from, 7))} aria-label="Next week" className="grid size-8 place-items-center rounded-lg ring-1 ring-line hover:bg-ink/5">
          ›
        </button>
      </div>

      {data && (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
            <Clock className="size-3.5" /> Works {workHoursLabel(data)}
          </p>

          <div className="mt-4 grid grid-cols-[56px_1fr] gap-x-3">
            <span />
            <div className="relative mb-1 h-4">
              {ticks.map((t) => (
                <span key={t} className="absolute -translate-x-1/2 font-mono text-[10px] text-ink-soft first:translate-x-0 last:-translate-x-full" style={{ left: at(t) }}>
                  {time12(t).replace(":00", "")}
                </span>
              ))}
            </div>

            {data.days.map((day) => {
              const off = !day.working || day.onLeave;
              const gaps = off ? [] : freeGaps(day.slots, data.workStart, data.workEnd);
              return (
                <div key={day.date} className="contents">
                  <div className={`pt-1.5 text-xs ${day.date === today ? "font-bold text-accent" : ""}`}>
                    {day.weekday}
                    <span className="block font-mono text-[10px] text-ink-soft">{dateLabel(day.date)}</span>
                  </div>
                  <div className="mb-3">
                    <div
                      className={`relative h-8 overflow-hidden rounded-lg ring-1 ${
                        day.onLeave ? "bg-leave-soft ring-leave/30" : off ? "bg-line/40 ring-line" : "bg-available-soft ring-available/30"
                      }`}
                    >
                      {off && (
                        <span className={`grid h-full place-items-center text-[11px] ${day.onLeave ? "text-leave" : "text-ink-soft"}`}>
                          {day.onLeave ? "On leave" : "Day off"}
                        </span>
                      )}
                      {!off &&
                        day.slots.map((slot, i) => (
                          <span
                            key={i}
                            title={`${slot.label} · ${time12(slot.startTime)} – ${time12(slot.endTime)}${slot.status === "pending" ? " (request)" : ""}`}
                            className={`absolute inset-y-0 flex items-center overflow-hidden whitespace-nowrap px-1.5 text-[10px] font-medium ${
                              slot.status === "pending"
                                ? "border-2 border-dashed border-booked bg-booked-soft text-booked"
                                : "bg-booked text-paper"
                            }`}
                            style={{ left: at(slot.startTime), width: `calc(${at(slot.endTime)} - ${at(slot.startTime)})` }}
                          >
                            {slot.label}
                          </span>
                        ))}
                    </div>
                    {!off && (
                      <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink-soft">
                        {day.slots.map((s) => `${s.status === "pending" ? "Requested" : "Busy"} ${time12(s.startTime)}–${time12(s.endTime)}`).join(" · ")}
                        {day.slots.length > 0 && gaps.length > 0 && " · "}
                        {gaps.length === 0 ? (day.slots.length ? "" : "Fully booked") : (
                          <span className="text-available">
                            Free {gaps.map((g) => `${time12(g.startTime)}–${time12(g.endTime)}`).join(", ")}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[11px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-available" /> Free
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-booked" /> Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full border border-dashed border-booked" /> Requested
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-leave" /> Leave
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-line" /> Day off
            </span>
          </div>
        </>
      )}
    </div>
  );
}
