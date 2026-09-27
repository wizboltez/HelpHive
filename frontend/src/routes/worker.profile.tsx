import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { DetailsForm, DocumentUploader, PhotoUploader, ServicesEditor } from "@/components/HelperForms";
import { Empty, Loading, PageHeader, ui } from "@/components/Page";
import { Chip } from "@/components/StatusChip";
import { api } from "@/lib/api";
import { dateLabel, localDate } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { ProfileChanges, WorkerProfile } from "@/lib/types";

export const Route = createFileRoute("/worker/profile")({
  head: () => ({ meta: [{ title: "My profile — HelpHive helper" }] }),
  component: () => (
    <AppShell role="worker">
      <Profile />
    </AppShell>
  ),
});

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={ui.card}>
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const fieldNames: Record<keyof ProfileChanges, string> = {
  name: "name",
  categories: "categories",
  summary: "about you",
  ratePerVisit: "rate",
  services: "extra services",
  photoFile: "photo",
};

function Profile() {
  const { data: profile } = useApi<WorkerProfile>("/worker/profile");
  if (!profile) return <Loading />;

  const verified = profile.verification === "verified";
  const change = profile.latestChange;
  const changedFields = change ? (Object.keys(change.changes) as (keyof ProfileChanges)[]).map((k) => fieldNames[k]) : [];

  return (
    <>
      <PageHeader eyebrow="My profile" title="How residents see you.">
        {verified
          ? "Changes to your details, services and photo are reviewed by the society admin before they go live."
          : "Complete your profile and upload an ID document. The society admin verifies you before residents can book you."}
      </PageHeader>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {verified ? <Chip tone="available">Verified</Chip> : profile.verification === "rejected" ? <Chip tone="absent">Not approved</Chip> : <Chip tone="booked">Awaiting verification</Chip>}
        {verified && (
          <Link to="/helpers/$helperId" params={{ helperId: profile.slug }} className={`${ui.ghostButton} inline-flex items-center gap-1.5`}>
            View public profile <ExternalLink className="size-3" />
          </Link>
        )}
      </div>
      {profile.verificationNote && profile.verification !== "verified" && (
        <p className={`${ui.row} mt-3 max-w-2xl`}>Admin note: {profile.verificationNote}</p>
      )}

      {change?.status === "pending" && (
        <div className="mt-5 flex max-w-2xl gap-3 rounded-2xl bg-booked-soft p-4 text-sm text-booked ring-1 ring-booked/30">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <p>
            Your changes to <strong>{changedFields.join(", ")}</strong> are waiting for admin approval. Residents still see
            your current profile until then. Edits you make now are added to the same request.
          </p>
        </div>
      )}
      {change?.status === "rejected" && (
        <p className="mt-5 max-w-2xl rounded-2xl bg-absent-soft p-4 text-sm text-absent ring-1 ring-absent/30">
          Your last changes ({changedFields.join(", ")}) were not approved{change.note ? `: "${change.note}"` : "."}
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Details">
          <DetailsForm key={JSON.stringify([profile.name, profile.categories, profile.summary, profile.ratePerVisit])} profile={profile} submitLabel={verified ? "Send for approval" : "Save details"} />
        </Section>
        <div className="space-y-6">
          <Availability profile={profile} />
          <Section title="Photo">
            <PhotoUploader profile={profile} />
          </Section>
        </div>
        <Section title="Extra services" hint="Per-visit add-ons like daily chapatis, or one-off ones like cooking for an event.">
          <ServicesEditor key={JSON.stringify(profile.services)} profile={profile} submitLabel={verified ? "Send for approval" : "Save services"} />
        </Section>
        <Section title="Verification documents">
          <DocumentUploader profile={profile} />
        </Section>
        <Leave leaves={profile.leaves} />
      </div>
    </>
  );
}

function Availability({ profile }: { profile: WorkerProfile }) {
  const toggle = useAction(
    (isAccepting: boolean) => api("/worker/availability", { method: "PUT", body: { isAccepting } }),
    "Availability updated",
  );
  return (
    <Section title="Availability">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-medium">Taking new bookings</span>
          <span className="block text-xs text-ink-soft">Turn off when your week is full. Takes effect immediately.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={profile.isAccepting}
          onClick={() => toggle.mutate(!profile.isAccepting)}
          disabled={toggle.isPending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${profile.isAccepting ? "bg-available" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-paper shadow transition-all ${profile.isAccepting ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </label>
    </Section>
  );
}

function Leave({ leaves }: { leaves: WorkerProfile["leaves"] }) {
  const [form, setForm] = useState({ startDate: localDate(1), endDate: localDate(1), reason: "" });
  const add = useAction(() => api("/worker/leaves", { method: "POST", body: form }), "Leave added — your residents have been told");
  const remove = useAction((id: string) => api(`/worker/leaves/${id}`, { method: "DELETE" }), "Leave removed");

  return (
    <Section title="Leave" hint="Residents with bookings on those days are notified automatically.">
      <div className="space-y-2">
        {leaves.length === 0 && <Empty>No upcoming leave.</Empty>}
        {leaves.map((leave) => (
          <div key={leave.id} className={`${ui.row} flex items-center justify-between`}>
            <span>
              {dateLabel(leave.startDate)} – {dateLabel(leave.endDate)}
              {leave.reason && <span className="ml-2 text-xs text-ink-soft">{leave.reason}</span>}
            </span>
            {leave.startDate > localDate() && (
              <button onClick={() => remove.mutate(leave.id)} className="text-xs text-ink-soft hover:text-absent">
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <form
        className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(undefined, { onSuccess: () => setForm({ ...form, reason: "" }) });
        }}
      >
        <label>
          <span className={ui.eyebrow}>From</span>
          <input type="date" min={localDate()} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })} className={ui.field} />
        </label>
        <label>
          <span className={ui.eyebrow}>To</span>
          <input type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={ui.field} />
        </label>
        <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason (optional)" className={`${ui.field} col-span-2`} />
        <button disabled={add.isPending} className={`${ui.darkButton} col-span-2 justify-self-start`}>
          Add leave
        </button>
      </form>
    </Section>
  );
}
