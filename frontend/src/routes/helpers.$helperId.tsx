import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AttendanceCalendar } from "@/components/AttendanceCalendar";
import { Avatar, Empty, ErrorNote, Loading, ui } from "@/components/Page";
import { CategoryChips } from "@/components/Fields";
import { StatusChip } from "@/components/StatusChip";
import { WeeklySchedule } from "@/components/WeeklySchedule";
import { api } from "@/lib/api";
import { dateLabel, daysLabel, localDate, rupees, time12, WEEK, workHoursLabel } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { HelperProfile as Profile, Plan, Quote } from "@/lib/types";

export const Route = createFileRoute("/helpers/$helperId")({
  head: () => ({ meta: [{ title: "Helper profile — HelpHive" }] }),
  component: () => (
    <AppShell role="resident">
      <HelperProfile />
    </AppShell>
  ),
});

function HelperProfile() {
  const { helperId } = Route.useParams();
  const { data: helper, isLoading, error } = useApi<Profile>(`/helpers/${helperId}`);

  if (isLoading) return <Loading />;
  if (!helper) return <ErrorNote error={error} />;

  return (
    <>
      <Link to="/helpers" className="font-mono text-xs text-ink-soft hover:text-accent">
        ← All helpers
      </Link>

      <section className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <div className={ui.card}>
            <div className="flex items-start gap-4">
              <Avatar name={helper.name} photoUrl={helper.photoUrl} className="size-20 rounded-2xl text-2xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h1 className="font-display text-2xl font-semibold tracking-tight">{helper.name}</h1>
                  <span className="font-mono text-xs text-booked">
                    {helper.reviewCount ? `${helper.rating} ★ · ${helper.reviewCount} reviews` : "No reviews yet"}
                  </span>
                </div>
                <div className="mt-2">
                  <CategoryChips categories={helper.categories} />
                </div>
                {helper.summary && <p className="mt-2 text-sm text-ink-soft">{helper.summary}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusChip status={helper.status} />
                  <span className="font-mono text-xs text-ink-soft">
                    {helper.hoursLast30Days} h worked in the last 30 days
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  <span className={ui.eyebrow}>Working hours</span>{" "}
                  <span className="font-medium">{workHoursLabel(helper)}</span>
                </p>
                {helper.nextLeave && (
                  <p className="mt-2 text-xs text-leave">
                    On leave {dateLabel(helper.nextLeave.startDate)} – {dateLabel(helper.nextLeave.endDate)}
                  </p>
                )}
              </div>
            </div>

            <p className={`${ui.eyebrow} mb-2 mt-5`}>Houses worked</p>
            {helper.houses.length === 0 ? (
              <Empty>No regular houses yet.</Empty>
            ) : (
              <div className="divide-y divide-line text-sm">
                {helper.houses.map((house, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <span className="font-mono">{house.flat}</span>
                    <span className="text-ink-soft">
                      {daysLabel(house.days)} · {time12(house.startTime)} – {time12(house.endTime)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className={`${ui.eyebrow} mb-2 mt-5`}>Extra services</p>
            {helper.services.length === 0 && <Empty>No extra services listed.</Empty>}
            <div className="space-y-2">
              {helper.services.map((s) => (
                <div key={s.id} className={`${ui.row} flex items-center justify-between`}>
                  <span>
                    {s.label}
                    <span className="ml-2 text-xs text-ink-soft">
                      + {rupees(s.price)} {s.unit === "visit" ? "per visit" : "per booking"}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-medium ring-1 ${
                      s.isAvailable ? "bg-available-soft text-available ring-available/30" : "bg-leave-soft text-leave ring-leave/30"
                    }`}
                  >
                    {s.isAvailable ? "Yes" : "Not now"}
                  </span>
                </div>
              ))}
            </div>

            <p className={`${ui.eyebrow} mb-2 mt-5`}>Reviews</p>
            {helper.reviews.length === 0 && <Empty>No reviews yet.</Empty>}
            <div className="space-y-3">
              {helper.reviews.map((review, i) => (
                <div key={i} className={`${ui.row} py-3`}>
                  {review.comment && <p className="text-pretty">"{review.comment}"</p>}
                  <p className="mt-1.5 font-mono text-[11px] text-ink-soft">
                    {review.residentName} · {review.flat} · {review.stars} ★
                  </p>
                </div>
              ))}
            </div>
          </div>

          <WeeklySchedule helperId={helper.id} title="Weekly schedule" />
          <AttendanceCalendar helpers={[helper]} />
        </div>

        <aside className="space-y-4 self-start lg:sticky lg:top-[77px]">
          <BookingForm helper={helper} />
        </aside>
      </section>
    </>
  );
}

/** "08:00" + 2 → "10:00" */
const addHours = (time: string, hours: number) => `${String(Number(time.slice(0, 2)) + hours).padStart(2, "0")}${time.slice(2)}`;

/** The helper's weekdays (Mon–Fri), or all their days if they only work weekends. */
function defaultDays(workDays: string[]): string[] {
  const weekdays = WEEK.filter((d) => workDays.includes(d) && d !== "Sat" && d !== "Sun");
  return weekdays.length ? weekdays : WEEK.filter((d) => workDays.includes(d));
}

function BookingForm({ helper }: { helper: Profile }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    plan: "weekly" as Plan,
    startDate: localDate(1),
    // Start inside the helper's working hours: their first two hours, on their weekdays.
    days: defaultDays(helper.workDays),
    startTime: helper.workStart,
    endTime: helper.workEnd < addHours(helper.workStart, 2) ? helper.workEnd : addHours(helper.workStart, 2),
    serviceIds: [] as string[],
    notes: "",
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const body = { helperId: helper.id, ...form, days: form.plan === "one_time" ? undefined : form.days };
  // Live price from the server, recalculated whenever a priced field changes. The note
  // doesn't affect price, and the previous quote stays on screen while the next one loads.
  const { notes: _notes, ...priced } = body;
  const quote = useQuery({
    queryKey: ["quote", priced],
    queryFn: () => api<Quote>("/bookings/quote", { method: "POST", body: priced }),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const quoteData = quote.data;
  const quoteError = quote.error?.message;

  const book = useAction(() => api("/bookings", { method: "POST", body }), "Request sent — you'll be notified when it's accepted");
  const canBook = helper.status !== "booked" && quoteData;

  return (
    <form
      className={ui.card}
      onSubmit={(e) => {
        e.preventDefault();
        book.mutate(undefined, { onSuccess: () => navigate({ to: "/bookings" }) });
      }}
    >
      <p className="font-display text-lg font-semibold tracking-tight">Book {helper.name.split(" ")[0]}</p>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-paper p-1 text-sm ring-1 ring-line">
        {(["one_time", "weekly", "monthly"] as const).map((plan) => (
          <button
            type="button"
            key={plan}
            onClick={() => set("plan", plan)}
            className={`rounded-lg py-2 font-medium ${form.plan === plan ? "bg-card ring-1 ring-line" : "text-ink-soft"}`}
          >
            {plan === "one_time" ? "One-time" : plan === "weekly" ? "Weekly" : "Monthly"}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className={ui.eyebrow}>{form.plan === "one_time" ? "Date" : "Starting"}</span>
        <input type="date" min={localDate(0)} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={ui.field} />
      </label>

      {form.plan !== "one_time" && (
        <div className="mt-3">
          <span className={ui.eyebrow}>Days</span>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {WEEK.map((day) => (
              <button
                type="button"
                key={day}
                disabled={!helper.workDays.includes(day)}
                title={helper.workDays.includes(day) ? undefined : "Day off"}
                onClick={() => set("days", toggle(form.days, day))}
                className={`rounded-lg py-1.5 text-xs ring-1 disabled:cursor-not-allowed disabled:opacity-30 disabled:line-through ${
                  form.days.includes(day) ? "bg-ink text-paper ring-ink" : "bg-paper text-ink-soft ring-line"
                }`}
              >
                {day.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label>
          <span className={ui.eyebrow}>From</span>
          <input type="time" min={helper.workStart} max={helper.workEnd} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} className={ui.field} />
        </label>
        <label>
          <span className={ui.eyebrow}>To</span>
          <input type="time" min={helper.workStart} max={helper.workEnd} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} className={ui.field} />
        </label>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-soft">
        Works {time12(helper.workStart)} – {time12(helper.workEnd)}. Check the weekly schedule for free slots.
      </p>

      {helper.services.some((s) => s.isAvailable) && (
        <div className="mt-3 space-y-1.5">
          <span className={ui.eyebrow}>Add services</span>
          {helper.services
            .filter((s) => s.isAvailable)
            .map((s) => (
              <label key={s.id} className={`${ui.row} flex items-center gap-2`}>
                <input
                  type="checkbox"
                  checked={form.serviceIds.includes(s.id)}
                  onChange={() => set("serviceIds", toggle(form.serviceIds, s.id))}
                  className="accent-accent"
                />
                {s.label}
                <span className="ml-auto font-mono text-xs text-ink-soft">
                  {rupees(s.price)}/{s.unit === "visit" ? "visit" : "booking"}
                </span>
              </label>
            ))}
        </div>
      )}

      <label className="mt-3 block">
        <span className={ui.eyebrow}>Note for the helper</span>
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={ui.field} placeholder="Optional" />
      </label>

      <div className="mt-4 space-y-2.5 border-t border-line pt-3 text-sm">
        {quoteError && <p className="text-xs text-absent">{quoteError}</p>}
        {quoteData && (
          <>
            <div className="flex justify-between">
              <span className="text-ink-soft">
                {quoteData.visits} visit{quoteData.visits === 1 ? "" : "s"} × {rupees(quoteData.ratePerVisit)}
              </span>
              <span className="font-mono">{rupees(quoteData.base)}</span>
            </div>
            {quoteData.extras.map((extra) => (
              <div key={extra.id} className="flex justify-between">
                <span className="text-ink-soft">{extra.label}</span>
                <span className="font-mono">{rupees(extra.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-ink-soft">Convenience fee</span>
              <span className="font-mono">{rupees(quoteData.fee)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2.5 font-medium">
              <span>
                Total · {dateLabel(quoteData.startDate)}
                {quoteData.endDate !== quoteData.startDate && ` – ${dateLabel(quoteData.endDate)}`}
              </span>
              <span className="font-mono">{rupees(quoteData.total)}</span>
            </div>
          </>
        )}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-soft">
        <span className="size-1.5 rounded-full bg-available" />
        Free cancellation until 24h before the first visit. Pay your helper directly.
      </p>
      <button disabled={!canBook || book.isPending} className={`${ui.primaryButton} mt-4 w-full`}>
        {helper.status === "booked" ? "Not taking new work" : book.isPending ? "Sending…" : "Send booking request"}
      </button>
    </form>
  );
}
