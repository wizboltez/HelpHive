import { createFileRoute, Link } from "@tanstack/react-router";
import { ActionDialog } from "@/components/ActionDialog";
import { AppShell } from "@/components/AppShell";
import { Empty, Loading, PageHeader, ui } from "@/components/Page";
import { api } from "@/lib/api";
import { dateLabel, daysLabel, planLabel, rupees, time12 } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { Booking, WorkerProfile } from "@/lib/types";

export const Route = createFileRoute("/worker/requests")({
  head: () => ({ meta: [{ title: "House requests — HelpHive helper" }] }),
  component: () => (
    <AppShell role="worker">
      <WorkerRequests />
    </AppShell>
  ),
});

function WorkerRequests() {
  const { data: requests, isLoading } = useApi<Booking[]>("/bookings?status=pending");
  const { data: profile } = useApi<WorkerProfile>("/worker/profile");
  const accept = useAction((id: string) => api(`/bookings/${id}/accept`, { method: "POST" }), "Booking accepted");
  const decline = useAction(
    ({ id, reason }: { id: string; reason: string }) => api(`/bookings/${id}/reject`, { method: "POST", body: { reason } }),
    "Request declined",
  );

  return (
    <>
      <PageHeader eyebrow="Open in your block" title="Choose the houses you want.">
        Every request shows the flat, the hours and the pay before you say yes. Decline anything that doesn't fit your day.
      </PageHeader>

      <div className="mt-8 space-y-3">
        {isLoading && <Loading />}
        {requests?.length === 0 && <Empty>No requests right now. New ones appear here and in your alerts.</Empty>}
        {requests?.map((r, i) => (
          <div key={r.id} className={`${ui.card} settle flex flex-wrap items-center gap-3 px-4 py-4`} style={{ animationDelay: `${i * 90}ms` }}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {r.residentName} · {r.flat} · {planLabel[r.plan]}
              </p>
              <p className="font-mono text-xs text-ink-soft">
                {daysLabel(r.days)} · {time12(r.startTime)}–{time12(r.endTime)} · from {dateLabel(r.startDate)} · {r.visits} visits ·{" "}
                {rupees(r.ratePerVisit)}/visit
              </p>
              {r.extras.length > 0 && (
                <p className="mt-1 text-xs text-ink-soft">Also: {r.extras.map((e) => e.label).join(", ")}</p>
              )}
              {r.notes && <p className="mt-1 text-xs text-ink-soft">Note: "{r.notes}"</p>}
            </div>
            <ActionDialog
              trigger={<button className={ui.ghostButton}>Decline</button>}
              title={`Decline ${r.residentName}'s request?`}
              description="They'll be notified so they can book someone else."
              field={{ label: "Reason (optional)", placeholder: "e.g. I'm already booked at that time" }}
              confirmLabel="Decline request"
              danger
              onConfirm={(reason) => decline.mutateAsync({ id: r.id, reason })}
            />
            <button onClick={() => accept.mutate(r.id)} disabled={accept.isPending} className={ui.darkButton}>
              Accept
            </button>
          </div>
        ))}
      </div>

      <div className={`${ui.card} mt-8`}>
        <div className="mb-3 flex items-center justify-between">
          <p className={ui.eyebrow}>What I can take on</p>
          <Link to="/worker/profile" className="font-mono text-xs text-ink-soft hover:text-accent">
            Edit →
          </Link>
        </div>
        {profile?.services.length === 0 && <Empty>No extra services listed yet.</Empty>}
        <div className="space-y-2 text-sm">
          {profile?.services.map((s) => (
            <div key={s.id} className={`${ui.row} flex items-center justify-between`}>
              <span>
                {s.label} <span className="ml-1 text-xs text-ink-soft">{rupees(s.price)}/{s.unit}</span>
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-medium ring-1 ${
                  s.isAvailable ? "bg-available-soft text-available ring-available/30" : "bg-leave-soft text-leave ring-leave/30"
                }`}
              >
                {s.isAvailable ? "On" : "Off"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
