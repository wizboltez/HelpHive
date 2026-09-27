import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { HelperCard } from "@/components/HelperCard";
import { Empty, ErrorNote, Loading, PageHeader, ui } from "@/components/Page";
import { WEEK } from "@/lib/format";
import { useApi, useMeta } from "@/lib/hooks";
import type { Helper } from "@/lib/types";

export const Route = createFileRoute("/helpers/")({
  head: () => ({ meta: [{ title: "Find helpers — HelpHive" }] }),
  component: () => (
    <AppShell role="resident">
      <HelpersList />
    </AppShell>
  ),
});

function HelpersList() {
  const { data: meta } = useMeta();
  const [filters, setFilters] = useState({ q: "", category: "", service: "", status: "", minRating: "", day: "", time: "" });
  const set = (key: keyof typeof filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));

  // Only send filters that are filled in; "free at" needs both a day and a time.
  const query = useDeferredValue(
    new URLSearchParams(
      Object.entries(filters).filter(([key, value]) => value && ((key !== "day" && key !== "time") || (filters.day && filters.time))),
    ).toString(),
  );
  const { data: helpers, isLoading, error } = useApi<Helper[]>(`/helpers?${query}`);

  return (
    <>
      <PageHeader eyebrow="Block register" title="Helpers near you">
        Every helper here has been verified by the society admin. Open a profile for their houses, timings, reviews and
        extra services.
      </PageHeader>

      <div className={`${ui.card} mt-8 grid grid-cols-2 gap-3 md:grid-cols-6`}>
        <label className="col-span-2">
          <span className={ui.eyebrow}>Search</span>
          <input value={filters.q} onChange={(e) => set("q", e.target.value)} placeholder="Name, skill or extra service…" className={ui.field} />
        </label>
        <label>
          <span className={ui.eyebrow}>Category</span>
          <select value={filters.category} onChange={(e) => set("category", e.target.value)} className={ui.field}>
            <option value="">All</option>
            {meta?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={ui.eyebrow}>Status</span>
          <select value={filters.status} onChange={(e) => set("status", e.target.value)} className={ui.field}>
            <option value="">Any</option>
            <option value="available">Available</option>
            <option value="booked">Not taking work</option>
            <option value="leave">On leave</option>
          </select>
        </label>
        <label>
          <span className={ui.eyebrow}>Rating</span>
          <select value={filters.minRating} onChange={(e) => set("minRating", e.target.value)} className={ui.field}>
            <option value="">Any</option>
            <option value="4">4★ and up</option>
            <option value="4.5">4.5★ and up</option>
          </select>
        </label>
        <div>
          <span className={ui.eyebrow}>Free at</span>
          <div className="flex gap-1">
            <select value={filters.day} onChange={(e) => set("day", e.target.value)} className={ui.field}>
              <option value="">Day</option>
              {WEEK.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <input type="time" value={filters.time} onChange={(e) => set("time", e.target.value)} className={ui.field} />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <ErrorNote error={error} />
        {isLoading && <Loading />}
        {helpers?.length === 0 && <Empty>No helpers match these filters.</Empty>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {helpers?.map((helper, i) => <HelperCard key={helper.id} helper={helper} delay={i * 60} />)}
        </div>
      </div>
    </>
  );
}
