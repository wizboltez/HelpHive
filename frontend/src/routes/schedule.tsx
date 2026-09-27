import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AttendanceCalendar } from "@/components/AttendanceCalendar";
import { DoorCode } from "@/components/DoorCode";
import { Empty, PageHeader, ui } from "@/components/Page";
import { clockOf, dateLabel, daysLabel, time12 } from "@/lib/format";
import { useApi, useMyHelpers } from "@/lib/hooks";
import type { Booking, Visit } from "@/lib/types";

export const Route = createFileRoute("/schedule")({
  head: () => ({ meta: [{ title: "Schedule & attendance — HelpHive" }] }),
  component: () => (
    <AppShell role="resident">
      <Schedule />
    </AppShell>
  ),
});

const stateText = { awaiting: "Awaiting door code", inside: "In progress", done: "Complete" };

function Schedule() {
  const { data: visits = [] } = useApi<Visit[]>("/visits/today", { refetchInterval: 15_000 });
  const { data: active = [] } = useApi<Booking[]>("/bookings?status=confirmed");
  const { helpers } = useMyHelpers();

  return (
    <>
      <PageHeader eyebrow="Attendance ledger" title="Every hour, written down.">
        Each visit opens with a door code and closes with one. Nothing is logged by hand.
      </PageHeader>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className={ui.card}>
            <p className={`${ui.eyebrow} mb-3`}>Today's in / out log</p>
            {visits.length === 0 && <Empty>No visits booked for today.</Empty>}
            <div className="divide-y divide-line text-sm">
              {visits.map((v) => (
                <div key={v.bookingId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{v.helper.name}</p>
                    <p className="font-mono text-xs text-ink-soft">
                      {time12(v.startTime)} – {time12(v.endTime)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs">
                      In {clockOf(v.checkInAt)} · Out {clockOf(v.checkOutAt)}
                    </p>
                    <p className="text-[11px] text-ink-soft">{stateText[v.state]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AttendanceCalendar helpers={helpers} title="Attendance search" />

          <div className={ui.card}>
            <p className={`${ui.eyebrow} mb-3`}>Weekly timings</p>
            {active.length === 0 && <Empty>No active plans.</Empty>}
            <div className="divide-y divide-line text-sm">
              {active.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    {b.helperName}
                    <span className="ml-2 font-mono text-xs text-ink-soft">
                      until {dateLabel(b.endDate)}
                    </span>
                  </span>
                  <span className="text-ink-soft">
                    {daysLabel(b.days)} · {time12(b.startTime)} – {time12(b.endTime)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4 self-start lg:sticky lg:top-[77px]">
          {visits.map((visit) => (
            <DoorCode key={visit.bookingId} visit={visit} />
          ))}
          <div className={`${ui.card} space-y-2 text-[11px] text-ink-soft`}>
            <p className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-available" /> Green · present, in and out done
            </p>
            <p className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-absent" /> Red · absent, no code used
            </p>
            <p className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-leave" /> Blue · on leave
            </p>
          </div>
        </aside>
      </section>
    </>
  );
}
