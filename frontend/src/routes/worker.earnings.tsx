import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty, PageHeader, ui } from "@/components/Page";
import { localDate, planLabel, rupees, thisWeek } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Earnings } from "@/lib/types";

export const Route = createFileRoute("/worker/earnings")({
  head: () => ({ meta: [{ title: "Earnings — HelpHive helper" }] }),
  component: () => (
    <AppShell role="worker">
      <WorkerEarnings />
    </AppShell>
  ),
});

function monthBounds(month: string) {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function WorkerEarnings() {
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const { from, to } = monthBounds(month);
  const week = thisWeek();
  const { data: monthly } = useApi<Earnings>(`/worker/earnings?from=${from}&to=${to}`);
  const { data: weekly } = useApi<Earnings>(`/worker/earnings?from=${week.from}&to=${week.to}`);
  const monthName = new Date(`${from}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader eyebrow={`${monthName} ledger`} title={`${rupees(monthly?.totalAmount ?? 0)} earned in ${monthName}.`}>
        Counted from your door-code check-ins and check-outs, house by house. Collect payment directly from each resident.
      </PageHeader>

      <label className="mt-6 block max-w-xs">
        <span className={ui.eyebrow}>Month</span>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={ui.field} />
      </label>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className={ui.card}>
          <p className={`${ui.eyebrow} mb-3`}>By house</p>
          {monthly?.byHouse.length === 0 && <Empty>No completed visits this month.</Empty>}
          <div className="divide-y divide-line text-sm">
            {monthly?.byHouse.map((row) => (
              <div key={row.bookingId} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-mono">{row.flat}</p>
                  <p className="text-xs text-ink-soft">
                    {planLabel[row.plan]} · {row.visits} visit{row.visits === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="font-mono">{rupees(row.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className={`${ui.card} self-start`}>
          <p className="font-display text-lg font-semibold tracking-tight">This week</p>
          <p className="mt-2 font-display text-3xl font-bold tracking-tight">{rupees(weekly?.totalAmount ?? 0)}</p>
          <p className="mt-1 text-xs text-ink-soft">{weekly?.totalVisits ?? 0} completed visit{weekly?.totalVisits === 1 ? "" : "s"}</p>
          <div className="mt-4 divide-y divide-line text-sm">
            {weekly?.byHouse.map((row) => (
              <div key={row.bookingId} className="flex items-center justify-between py-2.5">
                <span className="font-mono text-ink-soft">{row.flat}</span>
                <span>{rupees(row.amount)}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}
