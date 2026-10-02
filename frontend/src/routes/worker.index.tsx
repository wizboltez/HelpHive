import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AttendanceCalendar } from "@/components/AttendanceCalendar";
import { Empty, Loading, ui } from "@/components/Page";
import { OtpCard } from "@/components/OtpCard";
import { VerificationStatus } from "@/components/VerificationStatus";
import { WeeklySchedule } from "@/components/WeeklySchedule";
import { api } from "@/lib/api";
import { daysLabel, planLabel, rupees, thisWeek, time12 } from "@/lib/format";
import { useAction, useApi, useMe } from "@/lib/hooks";
import type { Booking, Earnings, Visit } from "@/lib/types";

export const Route = createFileRoute("/worker/")({
  head: () => ({ meta: [{ title: "Helper dashboard — HelpHive" }] }),
  component: () => (
    <AppShell role="worker">
      <WorkerDashboard />
    </AppShell>
  ),
});

function WorkerDashboard() {
  const { data: me } = useMe();
  const week = thisWeek();
  const { data: visits, isLoading } = useApi<Visit[]>("/visits/today");
  const { data: requests = [] } = useApi<Booking[]>("/bookings?status=pending");
  const { data: active = [] } = useApi<Booking[]>("/bookings?status=confirmed");
  const { data: earnings } = useApi<Earnings>(`/worker/earnings?from=${week.from}&to=${week.to}`);
  const accept = useAction((id: string) => api(`/bookings/${id}/accept`, { method: "POST" }), "Booking accepted");

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const count = visits?.length ?? 0;

  return (
    <>
      {(me?.verification === "pending" || me?.verification === "rejected") && (
        <section className={`${ui.card} mb-8 max-w-2xl`}>
          <p className={ui.eyebrow}>Your verification</p>
          <h2 className="mb-4 mt-1 font-display text-xl font-semibold tracking-tight">
            {me.verification === "pending" ? "Waiting for the society admin" : "Your documents need another look"}
          </h2>
          <VerificationStatus status={me.verification} />
        </section>
      )}

      <section className="max-w-2xl">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-soft">{today}</p>
        <h1 className="text-balance font-display text-4xl font-bold tracking-tight md:text-5xl">
          {count === 0 ? "No houses today." : `${count} house${count > 1 ? "s" : ""} today.`}
        </h1>
        <p className="mt-3 max-w-[46ch] text-pretty text-ink-soft">
          Ask the resident for the door code, tap in, and your hours are counted from the moment you arrive.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        {isLoading && <Loading />}
        {visits?.map((visit) => <OtpCard key={visit.bookingId} visit={visit} />)}
      </section>

      <section className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`${ui.card} md:col-span-2`}>
          <div className="mb-3 flex items-center justify-between">
            <p className={ui.eyebrow}>New house requests</p>
            <Link to="/worker/requests" className="font-mono text-xs text-ink-soft hover:text-accent">
              See all →
            </Link>
          </div>
          {requests.length === 0 && <Empty>No new requests.</Empty>}
          <div className="space-y-2.5">
            {requests.slice(0, 3).map((r) => (
              <div key={r.id} className={`${ui.row} flex items-center gap-3 py-3`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {r.residentName} · {r.flat} · {planLabel[r.plan]}
                  </p>
                  <p className="font-mono text-xs text-ink-soft">
                    {daysLabel(r.days)} · {time12(r.startTime)}–{time12(r.endTime)} · {rupees(r.ratePerVisit)}/visit
                  </p>
                </div>
                <button onClick={() => accept.mutate(r.id)} disabled={accept.isPending} className={ui.darkButton}>
                  Accept
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className={ui.card}>
          <p className={`${ui.eyebrow} mb-3`}>This week</p>
          <p className="font-display text-3xl font-bold tracking-tight">{rupees(earnings?.totalAmount ?? 0)}</p>
          <p className="mt-1 text-xs text-ink-soft">Earned · {earnings?.totalVisits ?? 0} completed visit{earnings?.totalVisits === 1 ? "" : "s"}</p>
          <Link to="/worker/earnings" className={`${ui.primaryButton} mt-4 block py-2.5 text-center`}>
            Earnings ledger
          </Link>
        </div>
      </section>

      {me && (
        <section className="mt-12">
          <WeeklySchedule helperId={me.id} title="My week" />
        </section>
      )}

      <section className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {me && <AttendanceCalendar helpers={[{ id: me.id, name: me.name }]} />}
        <aside className={`${ui.card} self-start`}>
          <p className="font-display text-lg font-semibold tracking-tight">My houses</p>
          {active.length === 0 && <p className="mt-3 text-sm text-ink-soft">No regular houses yet.</p>}
          <div className="mt-4 divide-y divide-line text-sm">
            {active.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2.5">
                <span className="font-mono">{b.flat}</span>
                <span className="text-right text-xs text-ink-soft">
                  {daysLabel(b.days)} · {time12(b.startTime)}–{time12(b.endTime)}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}
