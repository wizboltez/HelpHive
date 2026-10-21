import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Empty, Loading, PageHeader, ui } from "@/components/Page";
import { dateLabel, rupees, time12 } from "@/lib/format";
import { useApi } from "@/lib/hooks";

type WorkShift = {
  bookingId: string;
  date: string;
  flat: string;
  residentName: string;
  startTime: string;
  endTime: string;
  bookedCategories: string[];
  extras: { label: string }[];
};

export const Route = createFileRoute("/worker/work")({
  head: () => ({ meta: [{ title: "Work schedule — HelpHive helper" }] }),
  component: () => (
    <AppShell role="worker">
      <WorkSchedule />
    </AppShell>
  ),
});

function WorkSchedule() {
  const { data: work, isLoading } = useApi<WorkShift[]>("/bookings/work", {
    refetchInterval: 30_000,
  });

  return (
    <>
      <PageHeader eyebrow="Your confirmed visits" title="Work schedule.">
        See where to go, who booked you, and when. You’ll get an in-app notification 30 minutes
        before each visit.
      </PageHeader>

      <section className="mt-8 max-w-3xl space-y-3">
        {isLoading && <Loading />}
        {work?.length === 0 && (
          <Empty>No upcoming confirmed work yet. Accepted bookings will appear here.</Empty>
        )}
        {work?.map((shift) => {
          const services = [...shift.bookedCategories, ...shift.extras.map((extra) => extra.label)];
          return (
            <article key={`${shift.bookingId}-${shift.date}`} className={`${ui.card} settle`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold tracking-tight">
                    {dateLabel(shift.date, true)}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className={ui.eyebrow}>Where</span> {shift.flat}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className={ui.eyebrow}>Booked by</span> {shift.residentName}
                  </p>
                </div>
                <span className="rounded-full bg-available-soft px-3 py-1.5 font-mono text-xs text-available">
                  {time12(shift.startTime)}–{time12(shift.endTime)}
                </span>
              </div>
              {services.length > 0 && (
                <p className="mt-3 border-t border-line pt-3 text-sm text-ink-soft">
                  Booked for: {services.join(", ")}
                </p>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}
