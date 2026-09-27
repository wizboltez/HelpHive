import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ActionDialog } from "@/components/ActionDialog";
import { AppShell } from "@/components/AppShell";
import { CategoryChips } from "@/components/Fields";
import { Avatar, Empty, Loading, PageHeader, ui } from "@/components/Page";
import { BookingChip, Chip, ComplaintChip } from "@/components/StatusChip";
import { api, openPrivateFile } from "@/lib/api";
import { clockOf, dateLabel, daysLabel, docName, localDate, planLabel, rupees, time12 } from "@/lib/format";
import { useAction, useApi, useMeta } from "@/lib/hooks";
import type { Booking, Complaint, HelperDocument, ProfileChange, Role, ServiceDraft } from "@/lib/types";

const tabs = {
  verification: "Verification",
  changes: "Profile changes",
  attendance: "Attendance",
  bookings: "Bookings",
  complaints: "Complaints",
  users: "Users",
  buildings: "Buildings",
} as const;
type Tab = keyof typeof tabs;

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — HelpHive" }] }),
  // The open tab lives in the URL (e.g. /admin?tab=changes) so alerts can link straight to it.
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    typeof search["tab"] === "string" && search["tab"] in tabs ? { tab: search["tab"] as Tab } : {},
  component: () => (
    <AppShell role="admin">
      <Admin />
    </AppShell>
  ),
});

type Stats = Record<
  | "residents"
  | "workers"
  | "pendingVerifications"
  | "pendingProfileChanges"
  | "pendingBookings"
  | "activeBookings"
  | "openComplaints"
  | "checkInsToday",
  number
>;

function Admin() {
  const { tab = "verification" } = Route.useSearch();
  const navigate = useNavigate();
  const setTab = (next: Tab) => navigate({ to: "/admin", search: { tab: next }, replace: true });
  const { data: stats } = useApi<Stats>("/admin/stats", { refetchInterval: 30_000 });

  const badges: Partial<Record<Tab, number | undefined>> = {
    verification: stats?.pendingVerifications,
    changes: stats?.pendingProfileChanges,
    complaints: stats?.openComplaints,
  };
  const tiles: [string, number | undefined, Tab][] = [
    ["Residents", stats?.residents, "users"],
    ["Helpers", stats?.workers, "users"],
    ["To verify", stats?.pendingVerifications, "verification"],
    ["Profile changes", stats?.pendingProfileChanges, "changes"],
    ["Active bookings", stats?.activeBookings, "bookings"],
    ["Check-ins today", stats?.checkInsToday, "attendance"],
    ["Open complaints", stats?.openComplaints, "complaints"],
  ];

  return (
    <>
      <PageHeader eyebrow="Society admin" title="Everything in your society, at a glance." />

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map(([label, value, target]) => (
          <button key={label} onClick={() => setTab(target)} className={`${ui.card} text-left transition-transform hover:-translate-y-0.5`}>
            <p className={ui.eyebrow}>{label}</p>
            <p className="mt-1 font-display text-3xl font-bold">{value ?? "–"}</p>
          </button>
        ))}
      </section>

      <nav className="mt-10 flex gap-1 overflow-x-auto rounded-xl bg-card p-1 text-sm ring-1 ring-line">
        {(Object.keys(tabs) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-colors ${
              tab === t ? "bg-paper text-ink ring-1 ring-line" : "text-ink-soft hover:text-ink"
            }`}
          >
            {tabs[t]}
            {!!badges[t] && <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 text-paper">{badges[t]}</span>}
          </button>
        ))}
      </nav>

      <section className="mt-6">
        {tab === "verification" && <Verification />}
        {tab === "changes" && <ProfileChanges />}
        {tab === "attendance" && <Attendance />}
        {tab === "bookings" && <Bookings />}
        {tab === "complaints" && <Complaints />}
        {tab === "users" && <Users />}
        {tab === "buildings" && <Buildings />}
      </section>
    </>
  );
}

// ── Verification ─────────────────────────────────────────────

type AdminHelper = {
  id: string;
  name: string;
  email: string;
  phone: string;
  building: string | null;
  slug: string;
  categories: string[];
  summary: string;
  ratePerVisit: number;
  photoUrl: string | null;
  verification: "pending" | "verified" | "rejected";
  verificationNote: string | null;
  createdAt: string;
  documents: HelperDocument[];
};

function Verification() {
  const [filter, setFilter] = useState<"pending" | "verified" | "rejected">("pending");
  const { data: helpers, isLoading } = useApi<AdminHelper[]>(`/admin/helpers?verification=${filter}`);
  const decide = useAction(
    ({ id, status, note }: { id: string; status: "verified" | "rejected"; note: string }) =>
      api(`/admin/helpers/${id}/verification`, { method: "POST", body: { status, note } }),
    "Decision saved — the helper has been notified",
  );

  return (
    <div className="space-y-3">
      <Filter value={filter} onChange={setFilter} options={{ pending: "Awaiting review", verified: "Verified", rejected: "Not approved" }} />
      {isLoading && <Loading />}
      {helpers?.length === 0 && <Empty>{filter === "pending" ? "No helpers waiting for verification." : "No helpers here."}</Empty>}
      {helpers?.map((h) => (
        <div key={h.id} className={ui.card}>
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={h.name} photoUrl={h.photoUrl} className="size-16 rounded-2xl text-lg" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold">{h.name}</p>
              <p className="font-mono text-xs text-ink-soft">
                {h.phone} · {h.email} {h.building && `· ${h.building}`}
              </p>
              <div className="mt-2">
                <CategoryChips categories={h.categories} />
              </div>
              {h.summary && <p className="mt-2 text-sm text-ink-soft">{h.summary}</p>}
              <p className="mt-1 text-sm">
                Rate <span className="font-mono">{rupees(h.ratePerVisit)}</span>/visit
              </p>
              {h.verificationNote && <p className="mt-1 text-xs text-ink-soft">Note: {h.verificationNote}</p>}
            </div>
            <div className="flex gap-2">
              {h.verification !== "rejected" && (
                <ActionDialog
                  trigger={<button className={ui.ghostButton}>Reject</button>}
                  title={`Reject ${h.name}?`}
                  description="They'll see your note and can upload new documents."
                  field={{ label: "Reason", placeholder: "e.g. The ID photo is blurry", required: true }}
                  confirmLabel="Reject"
                  danger
                  onConfirm={(note) => decide.mutateAsync({ id: h.id, status: "rejected", note })}
                />
              )}
              {h.verification !== "verified" && (
                <ActionDialog
                  trigger={
                    <button disabled={h.documents.length === 0} className={ui.darkButton}>
                      Verify
                    </button>
                  }
                  title={`Verify ${h.name}?`}
                  description="Residents will be able to find and book them straight away."
                  field={{ label: "Note to the helper (optional)" }}
                  confirmLabel="Verify helper"
                  onConfirm={(note) => decide.mutateAsync({ id: h.id, status: "verified", note })}
                />
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <span className={`${ui.eyebrow} self-center`}>Documents</span>
            {h.documents.length === 0 && <span className="text-xs text-ink-soft">None uploaded.</span>}
            {h.documents.map((doc) => (
              <button key={doc.id} onClick={() => openPrivateFile(`/admin/documents/${doc.id}/file`)} className={ui.ghostButton}>
                {docName(doc)} ↗
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Profile changes ─────────────────────────────────────────

type ChangeRequest = ProfileChange & {
  current: { id: string; name: string; slug: string; categories: string[]; summary: string; ratePerVisit: number; photoUrl: string | null };
  currentServices: ServiceDraft[];
};

const servicesText = (services: ServiceDraft[]) =>
  services.length
    ? services.map((s) => `${s.label} · ${rupees(s.price)}/${s.unit === "visit" ? "visit" : "booking"}${s.isAvailable ? "" : " (off)"}`).join("\n")
    : "None";

function Diff({ label, before, after }: { label: string; before: ReactNode; after: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-line py-3 sm:grid-cols-[140px_1fr_auto_1fr] sm:items-start">
      <span className={ui.eyebrow}>{label}</span>
      <div className="whitespace-pre-line text-sm text-ink-soft line-through decoration-ink-soft/40">{before}</div>
      <ArrowRight className="hidden size-4 text-ink-soft sm:block" />
      <div className="whitespace-pre-line text-sm font-medium">{after}</div>
    </div>
  );
}

function ProfileChanges() {
  const { data: requests, isLoading } = useApi<ChangeRequest[]>("/admin/profile-changes");
  const decide = useAction(
    ({ id, status, note }: { id: string; status: "approved" | "rejected"; note: string }) =>
      api(`/admin/profile-changes/${id}`, { method: "POST", body: { status, note } }),
    "Decision saved — the helper has been notified",
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">Edits from verified helpers. Residents keep seeing the old profile until you approve.</p>
      {isLoading && <Loading />}
      {requests?.length === 0 && <Empty>No profile changes waiting.</Empty>}
      {requests?.map((r) => {
        const c = r.changes;
        return (
          <div key={r.id} className={ui.card}>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={r.current.name} photoUrl={r.current.photoUrl} className="size-10 rounded-full text-sm" />
              <div className="flex-1">
                <p className="font-medium">{r.current.name}</p>
                <p className="font-mono text-[11px] text-ink-soft">Submitted {dateLabel(r.createdAt.slice(0, 10))}</p>
              </div>
              <ActionDialog
                trigger={<button className={ui.ghostButton}>Reject</button>}
                title="Reject these changes?"
                description="The live profile stays as it is. The helper sees your reason."
                field={{ label: "Reason", required: true }}
                confirmLabel="Reject changes"
                danger
                onConfirm={(note) => decide.mutateAsync({ id: r.id, status: "rejected", note })}
              />
              <ActionDialog
                trigger={<button className={ui.darkButton}>Approve</button>}
                title="Approve and publish these changes?"
                field={{ label: "Note to the helper (optional)" }}
                confirmLabel="Approve"
                onConfirm={(note) => decide.mutateAsync({ id: r.id, status: "approved", note })}
              />
            </div>
            <div className="mt-3">
              {c.name !== undefined && <Diff label="Name" before={r.current.name} after={c.name} />}
              {c.categories && <Diff label="Categories" before={r.current.categories.join(", ") || "None"} after={c.categories.join(", ")} />}
              {c.summary !== undefined && <Diff label="About" before={r.current.summary || "—"} after={c.summary || "—"} />}
              {c.ratePerVisit !== undefined && <Diff label="Rate / visit" before={rupees(r.current.ratePerVisit)} after={rupees(c.ratePerVisit)} />}
              {c.services && <Diff label="Services" before={servicesText(r.currentServices)} after={servicesText(c.services)} />}
              {c.photoFile && (
                <Diff
                  label="Photo"
                  before={<Avatar name={r.current.name} photoUrl={r.current.photoUrl} className="size-20 rounded-2xl" />}
                  after={<Avatar name={r.current.name} photoUrl={`/uploads/photos/${c.photoFile}`} className="size-20 rounded-2xl" />}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Attendance ──────────────────────────────────────────────

type AttendanceRow = {
  bookingId: string;
  helper: { name: string };
  resident: { name: string };
  flat: string;
  startTime: string;
  endTime: string;
  state: "done" | "inside" | "missed" | "upcoming";
  checkInAt: string | null;
  checkOutAt: string | null;
};

const visitTone = { done: "available", inside: "booked", missed: "absent", upcoming: "neutral" } as const;
const visitText = { done: "Present", inside: "Inside", missed: "Missed", upcoming: "Upcoming" };

function Attendance() {
  const [date, setDate] = useState(localDate());
  const { data: rows, isLoading } = useApi<AttendanceRow[]>(`/admin/attendance?date=${date}`);
  return (
    <div className={ui.card}>
      <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={`${ui.field} mt-0 max-w-xs`} />
      <div className="mt-4 divide-y divide-line text-sm">
        {isLoading && <Loading />}
        {rows?.length === 0 && <Empty>No visits booked on {dateLabel(date, true)}.</Empty>}
        {rows?.map((r) => (
          <div key={r.bookingId} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span>
              <span className="font-medium">{r.helper.name}</span> at {r.resident.name}'s
              <span className="ml-2 font-mono text-xs text-ink-soft">
                {r.flat} · {time12(r.startTime)}–{time12(r.endTime)}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="font-mono text-xs">
                In {clockOf(r.checkInAt)} · Out {clockOf(r.checkOutAt)}
              </span>
              <Chip tone={visitTone[r.state]}>{visitText[r.state]}</Chip>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bookings ────────────────────────────────────────────────

function Bookings() {
  const [status, setStatus] = useState("");
  const { data: bookings, isLoading } = useApi<Booking[]>(`/bookings${status ? `?status=${status}` : ""}`);
  return (
    <div className={ui.card}>
      <Filter
        value={status}
        onChange={setStatus}
        options={{ "": "All bookings", pending: "Awaiting helper", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", rejected: "Declined" }}
      />
      <div className="mt-4 divide-y divide-line text-sm">
        {isLoading && <Loading />}
        {bookings?.length === 0 && <Empty>No bookings.</Empty>}
        {bookings?.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span>
              <span className="font-medium">{b.residentName}</span> ({b.flat}) booked <span className="font-medium">{b.helperName}</span>
              <span className="block font-mono text-xs text-ink-soft">
                {planLabel[b.plan]} · {daysLabel(b.days)} · {time12(b.startTime)}–{time12(b.endTime)} · {dateLabel(b.startDate)} –{" "}
                {dateLabel(b.endDate)} · {rupees(b.total)}
              </span>
            </span>
            <BookingChip status={b.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Complaints ──────────────────────────────────────────────

function Complaints() {
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed" | "">("open");
  const { data: complaints, isLoading } = useApi<Complaint[]>("/complaints");
  const shown = complaints?.filter((c) => !status || c.status === status);
  const update = useAction(
    ({ id, status, resolution }: { id: string; status: "resolved" | "dismissed"; resolution: string }) =>
      api(`/admin/complaints/${id}`, { method: "PATCH", body: { status, resolution } }),
    "Reply sent",
  );

  return (
    <div className="space-y-3">
      <Filter value={status} onChange={setStatus} options={{ open: "Open", resolved: "Resolved", dismissed: "Dismissed", "": "All" }} />
      {isLoading && <Loading />}
      {shown?.length === 0 && <Empty>No complaints here.</Empty>}
      {shown?.map((c) => (
        <div key={c.id} className={ui.card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {c.subject} <span className="ml-1 text-sm font-normal text-ink-soft">from {c.raisedByName}</span>
            </p>
            <ComplaintChip status={c.status} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">{c.description}</p>
          <p className="mt-1 font-mono text-[11px] text-ink-soft">{dateLabel(c.createdAt.slice(0, 10), true)}</p>
          {c.resolution && (
            <div className={`${ui.row} mt-3`}>
              <p className={ui.eyebrow}>Your reply</p>
              <p className="mt-1">{c.resolution}</p>
            </div>
          )}
          {c.status === "open" && (
            <div className="mt-3 flex gap-2">
              <ActionDialog
                trigger={<button className={ui.ghostButton}>Dismiss</button>}
                title="Dismiss this complaint?"
                field={{ label: `Reply to ${c.raisedByName}`, placeholder: "Explain why no action is needed", required: true }}
                confirmLabel="Dismiss"
                onConfirm={(resolution) => update.mutateAsync({ id: c.id, status: "dismissed", resolution })}
              />
              <ActionDialog
                trigger={<button className={ui.darkButton}>Resolve</button>}
                title="Mark as resolved"
                description={`${c.raisedByName} will see your reply on their complaints page.`}
                field={{ label: "What was done", placeholder: "e.g. Spoke to the helper; timings are fixed from Monday.", required: true }}
                confirmLabel="Send reply & resolve"
                onConfirm={(resolution) => update.mutateAsync({ id: c.id, status: "resolved", resolution })}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Users ───────────────────────────────────────────────────

type AdminUser = {
  id: string;
  role: Role;
  name: string;
  username: string;
  email: string;
  phone: string;
  building: string | null;
  place: string;
  isActive: boolean;
};

function Users() {
  const [role, setRole] = useState("");
  const { data: users, isLoading } = useApi<AdminUser[]>(`/admin/users${role ? `?role=${role}` : ""}`);
  const toggle = useAction(
    (u: AdminUser) => api(`/admin/users/${u.id}`, { method: "PATCH", body: { isActive: !u.isActive } }),
    "Account updated",
  );
  return (
    <div className={ui.card}>
      <Filter value={role} onChange={setRole} options={{ "": "Everyone", resident: "Residents", worker: "Helpers", admin: "Admins" }} />
      <div className="mt-4 divide-y divide-line text-sm">
        {isLoading && <Loading />}
        {users?.map((u) => (
          <div key={u.id} className={`flex flex-wrap items-center justify-between gap-2 py-3 ${u.isActive ? "" : "opacity-60"}`}>
            <span className="flex items-center gap-3">
              <Avatar name={u.name} className="size-8 rounded-full text-xs" />
              <span>
                <span className="font-medium">{u.name}</span>
                {!u.isActive && <span className="ml-2 text-xs text-absent">Deactivated</span>}
                <span className="block font-mono text-xs text-ink-soft">
                  {u.role === "worker" ? "helper" : u.role} · @{u.username} · {u.phone}
                  {u.building && ` · ${[u.building, u.place].filter(Boolean).join(" · ")}`}
                </span>
              </span>
            </span>
            {u.role !== "admin" &&
              (u.isActive ? (
                <ActionDialog
                  trigger={<button className={ui.ghostButton}>Deactivate</button>}
                  title={`Deactivate ${u.name}?`}
                  description="They'll be signed out immediately and can't log in until you reactivate them."
                  confirmLabel="Deactivate"
                  danger
                  onConfirm={() => toggle.mutateAsync(u)}
                />
              ) : (
                <button onClick={() => toggle.mutate(u)} className={ui.darkButton}>
                  Reactivate
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Buildings ───────────────────────────────────────────────

function Buildings() {
  const { data: meta } = useMeta();
  const [name, setName] = useState("");
  const add = useAction(() => api("/admin/buildings", { method: "POST", body: { name: name.trim() } }), "Building added");
  const remove = useAction((building: string) => api(`/admin/buildings/${encodeURIComponent(building)}`, { method: "DELETE" }), "Building removed");

  return (
    <div className={`${ui.card} max-w-xl`}>
      <p className="text-sm text-ink-soft">Residents and helpers choose from these when they sign up.</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(undefined, { onSuccess: () => setName("") });
        }}
      >
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tower A" className={`${ui.field} mt-0`} />
        <button disabled={add.isPending || !name.trim()} className={`${ui.darkButton} shrink-0`}>
          Add building
        </button>
      </form>
      <div className="mt-4 space-y-2">
        {meta?.buildings.length === 0 && <Empty>No buildings yet. Add one so people can sign up.</Empty>}
        {meta?.buildings.map((b) => (
          <div key={b} className={`${ui.row} flex items-center justify-between`}>
            <span className="font-medium">{b}</span>
            <ActionDialog
              trigger={
                <button aria-label={`Remove ${b}`} className="rounded p-1 text-ink-soft hover:text-absent">
                  <Trash2 className="size-4" />
                </button>
              }
              title={`Remove ${b}?`}
              description="Only possible if nobody lives in or serves this building."
              confirmLabel="Remove"
              danger
              onConfirm={() => remove.mutateAsync(b)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared ──────────────────────────────────────────────────

function Filter<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: Record<T, string> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(Object.keys(options) as T[]).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
            value === key ? "bg-ink text-paper ring-ink" : "bg-paper text-ink-soft ring-line hover:text-ink"
          }`}
        >
          {options[key]}
        </button>
      ))}
    </div>
  );
}
