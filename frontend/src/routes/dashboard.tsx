import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AttendanceCalendar } from "@/components/AttendanceCalendar";
import { DoorCode } from "@/components/DoorCode";
import { HelperCard } from "@/components/HelperCard";
import { Empty, Loading, ui } from "@/components/Page";
import { rupees, time12 } from "@/lib/format";
import { useApi, useMyHelpers } from "@/lib/hooks";
import type { Booking, Helper, Visit } from "@/lib/types";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Resident dashboard — HelpHive" }] }),
  component: () => (
    <AppShell role="resident">
      <Dashboard />
    </AppShell>
  ),
});

function headline(visits: Visit[]) {
  const next = visits.find((v) => v.state !== "done") ?? visits[0];
  if (!next) return "No help booked for today.";
  const name = next.helper.name;
  if (next.state === "inside") return `${name} is here at your door.`;
  if (next.state === "done") return `${name} has finished for today.`;
  return `${name} is due at ${time12(next.startTime)}.`;
}

function Dashboard() {
  const { data: visits, isLoading } = useApi<Visit[]>("/visits/today", { refetchInterval: 15_000 });
  const { data: bookings = [] } = useApi<Booking[]>("/bookings");
  const { data: allHelpers = [] } = useApi<Helper[]>("/helpers");
  const { helpers: myHelpers } = useMyHelpers();

  const mine = allHelpers.filter((h) => myHelpers.some((m) => m.id === h.id));
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const pending = bookings.filter((b) => b.status === "pending");
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <section className="max-w-2xl">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-soft">{today}</p>
        <h1 className="text-balance font-display text-4xl font-bold tracking-tight md:text-5xl">
          {isLoading ? "…" : headline(visits ?? [])}
        </h1>
        <p className="mt-3 max-w-[46ch] text-pretty text-ink-soft">
          Share today's code at the door. When your helper enters it on arrival and on leaving, the day is written into
          your attendance ledger.
        </p>
      </section>

      <section className="mt-8 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
        {isLoading && <Loading />}
        {visits?.map((visit) => <DoorCode key={visit.bookingId} visit={visit} />)}
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Your helpers</h2>
          <Link to="/helpers" className="font-mono text-xs text-ink-soft hover:text-accent">
            Find help →
          </Link>
        </div>
        {mine.length === 0 ? (
          <Empty>
            You haven't booked anyone yet.{" "}
            <Link to="/helpers" className="text-accent">
              Browse helpers in your block
            </Link>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((helper, i) => (
              <HelperCard key={helper.id} helper={helper} delay={i * 90} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <AttendanceCalendar helpers={myHelpers} title="Attendance search" />
        <aside className={`${ui.card} self-start`}>
          <p className="font-display text-lg font-semibold tracking-tight">Your bookings</p>
          <div className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-soft">Active plans</span>
              <span className="font-mono">{confirmed.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">Awaiting helper</span>
              <span className="font-mono">{pending.length}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2.5 font-medium">
              <span>Active plans total</span>
              <span className="font-mono">{rupees(confirmed.reduce((sum, b) => sum + b.total, 0))}</span>
            </div>
          </div>
          <Link to="/bookings" className={`${ui.primaryButton} mt-4 block text-center`}>
            Manage bookings
          </Link>
        </aside>
      </section>
    </>
  );
}
