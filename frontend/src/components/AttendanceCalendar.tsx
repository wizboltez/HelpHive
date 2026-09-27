import { useState } from "react";
import { useApi } from "@/lib/hooks";
import type { Attendance, AttendanceState } from "@/lib/types";
import { ui } from "./Page";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const tone: Record<AttendanceState, string> = {
  present: "bg-available-soft text-available ring-1 ring-available/30",
  absent: "bg-absent-soft text-absent ring-1 ring-absent/30",
  leave: "bg-leave-soft text-leave ring-1 ring-leave/30",
  none: "text-ink-soft/50",
};

const label: Record<AttendanceState, string> = {
  present: "Present — checked in and out with the door code",
  absent: "Absent — booked but no visit",
  leave: "On leave",
  none: "No visit recorded",
};

type HelperOption = { id: string; name: string };

/**
 * Month calendar of a helper's attendance, built by the server from real door-code check-ins.
 * Pass one helper, or several to show a picker.
 */
export function AttendanceCalendar({ helpers, title = "Attendance" }: { helpers: HelperOption[]; title?: string }) {
  const now = new Date();
  const [helperId, setHelperId] = useState(helpers[0]?.id);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  const activeId = helpers.some((h) => h.id === helperId) ? helperId : helpers[0]?.id;
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const { data } = useApi<Attendance>(activeId ? `/helpers/${activeId}/attendance?month=${monthKey}` : null);

  function step(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelected(null);
  }

  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const selectedDay = data?.days.find((d) => d.date === selected);

  return (
    <div className={ui.card}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="mr-auto font-display text-lg font-semibold tracking-tight">{title}</h4>
        <button onClick={() => step(-1)} aria-label="Previous month" className="grid size-8 place-items-center rounded-lg ring-1 ring-line hover:bg-ink/5">
          ‹
        </button>
        <span className="min-w-32 text-center text-sm">
          {MONTHS[month]} <span className="font-mono">{year}</span>
        </span>
        <button onClick={() => step(1)} aria-label="Next month" className="grid size-8 place-items-center rounded-lg ring-1 ring-line hover:bg-ink/5">
          ›
        </button>
      </div>

      {helpers.length > 1 && (
        <label className="mt-3 block">
          <span className={ui.eyebrow}>Helper</span>
          <select value={activeId} onChange={(e) => setHelperId(e.target.value)} className={ui.field}>
            {helpers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {helpers.length === 1 && <p className="mt-1 text-sm text-ink-soft">{helpers[0]!.name}'s record</p>}
      {helpers.length === 0 && <p className="mt-3 text-sm text-ink-soft">Book a helper to start an attendance record.</p>}

      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="font-mono text-[10px] text-ink-soft">
            {d}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {(data?.days ?? []).map((day) => (
          <button
            key={day.date}
            onClick={() => setSelected(day.date)}
            className={`grid h-9 place-items-center rounded-lg text-xs transition-transform hover:scale-105 ${tone[day.state]} ${
              selected === day.date ? "outline outline-2 outline-accent" : ""
            } ${day.date === todayKey ? "font-bold underline" : ""}`}
          >
            {Number(day.date.slice(8))}
          </button>
        ))}
      </div>

      {selectedDay && (
        <p className={`${ui.row} mt-3`}>
          <span className="font-mono text-xs text-ink-soft">
            {Number(selectedDay.date.slice(8))} {MONTHS[month]} {year}
          </span>{" "}
          · {label[selectedDay.state]}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-available" /> Present · {data?.totals.present ?? 0}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-absent" /> Absent · {data?.totals.absent ?? 0}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-leave" /> Leave · {data?.totals.leave ?? 0}
        </span>
      </div>
    </div>
  );
}
