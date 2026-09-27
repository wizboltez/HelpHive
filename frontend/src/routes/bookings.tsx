import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ActionDialog } from "@/components/ActionDialog";
import { AppShell } from "@/components/AppShell";
import { Empty, Loading, PageHeader, ui } from "@/components/Page";
import { BookingChip, Chip } from "@/components/StatusChip";
import { api } from "@/lib/api";
import { dateLabel, daysLabel, planLabel, rupees, time12 } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { Booking, BookingDetail } from "@/lib/types";

export const Route = createFileRoute("/bookings")({
  head: () => ({ meta: [{ title: "Bookings — HelpHive" }] }),
  component: () => (
    <AppShell role="resident">
      <Bookings />
    </AppShell>
  ),
});

function Bookings() {
  const { data: bookings, isLoading } = useApi<Booking[]>("/bookings");
  const current = bookings?.filter((b) => b.status === "pending" || b.status === "confirmed") ?? [];
  const past = bookings?.filter((b) => b.status !== "pending" && b.status !== "confirmed") ?? [];

  return (
    <>
      <PageHeader eyebrow="Your plans" title="Bookings">
        Cancel free until 24 hours before a plan starts. Payment is settled directly with your helper.
      </PageHeader>

      {isLoading && <Loading />}
      <section className="mt-8 max-w-3xl space-y-3">
        <p className={ui.eyebrow}>Active & requested</p>
        {bookings && current.length === 0 && (
          <Empty>
            No active bookings.{" "}
            <Link to="/helpers" className="text-accent">
              Find a helper
            </Link>
          </Empty>
        )}
        {current.map((b) => (
          <BookingRow key={b.id} booking={b} />
        ))}
      </section>

      {past.length > 0 && (
        <section className="mt-10 max-w-3xl space-y-3">
          <p className={ui.eyebrow}>Past</p>
          {past.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </section>
      )}
    </>
  );
}

function BookingRow({ booking: b }: { booking: Booking }) {
  const [open, setOpen] = useState<"details" | "review" | null>(null);
  const cancel = useAction((reason: string) => api(`/bookings/${b.id}/cancel`, { method: "POST", body: { reason } }), "Booking cancelled");
  const canReview = b.status === "confirmed" || b.status === "completed";

  return (
    <div className={`${ui.card} settle`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            <Link to="/helpers/$helperId" params={{ helperId: b.helperSlug }} className="hover:text-accent">
              {b.helperName}
            </Link>
            <span className="ml-2">
              <BookingChip status={b.status} />
            </span>
          </p>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            {planLabel[b.plan]} · {daysLabel(b.days)} · {time12(b.startTime)}–{time12(b.endTime)} · {dateLabel(b.startDate)}
            {b.endDate !== b.startDate && ` – ${dateLabel(b.endDate)}`}
          </p>
          {b.cancelReason && <p className="mt-1 text-xs text-ink-soft">Reason: {b.cancelReason}</p>}
        </div>
        <span className="font-mono text-sm">{rupees(b.total)}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setOpen(open === "details" ? null : "details")} className={ui.ghostButton}>
          {open === "details" ? "Hide days" : "Day by day"}
        </button>
        {canReview && (
          <button onClick={() => setOpen(open === "review" ? null : "review")} className={ui.ghostButton}>
            Rate helper
          </button>
        )}
        {(b.status === "pending" || b.status === "confirmed") &&
          (b.cancellable ? (
            <ActionDialog
              trigger={<button className={ui.darkButton}>Cancel free</button>}
              title={`Cancel your booking with ${b.helperName}?`}
              description="This is free because the plan starts more than 24 hours from now. The helper will be notified."
              field={{ label: "Reason (optional)", placeholder: "Let the helper know why" }}
              confirmLabel="Cancel booking"
              danger
              onConfirm={(reason) => cancel.mutateAsync(reason)}
            />
          ) : (
            <span className="rounded-lg bg-leave-soft px-3 py-2 text-xs font-medium text-leave">Past 24h window</span>
          ))}
      </div>

      {open === "details" && <DaySchedule bookingId={b.id} />}
      {open === "review" && <ReviewForm bookingId={b.id} onDone={() => setOpen(null)} />}
    </div>
  );
}

const dayTone = { done: "available", inside: "booked", missed: "absent", upcoming: "neutral" } as const;
const dayText = { done: "Present", inside: "Inside now", missed: "Missed", upcoming: "Upcoming" };

function DaySchedule({ bookingId }: { bookingId: string }) {
  const { data } = useApi<BookingDetail>(`/bookings/${bookingId}`);
  if (!data) return <Loading />;
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
      {data.schedule.map((day) => (
        <span key={day.date} className="flex items-center gap-1.5 text-xs">
          <span className="font-mono text-ink-soft">{dateLabel(day.date)}</span>
          <Chip tone={dayTone[day.state]}>{dayText[day.state]}</Chip>
        </span>
      ))}
    </div>
  );
}

function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const submit = useAction(
    () => api(`/bookings/${bookingId}/review`, { method: "POST", body: { stars, comment } }),
    "Thanks for the review!",
  );

  return (
    <form
      className="mt-3 space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate(undefined, { onSuccess: onDone });
      }}
    >
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            onClick={() => setStars(n)}
            aria-label={`${n} stars`}
            className={`text-2xl ${n <= stars ? "text-booked" : "text-ink-soft/30"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="How was the service?" className={ui.field} />
      <button disabled={submit.isPending} className={ui.darkButton}>
        Submit review
      </button>
    </form>
  );
}
