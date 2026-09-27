import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty, PageHeader, ui } from "@/components/Page";
import { ComplaintChip } from "@/components/StatusChip";
import { api } from "@/lib/api";
import { dateLabel } from "@/lib/format";
import { useAction, useApi, useMe, useMyHelpers } from "@/lib/hooks";
import type { Complaint } from "@/lib/types";

export const Route = createFileRoute("/complaints")({
  head: () => ({ meta: [{ title: "Help & complaints — HelpHive" }] }),
  component: () => (
    <AppShell role={["resident", "worker"]}>
      <Complaints />
    </AppShell>
  ),
});

function Complaints() {
  const { data: me } = useMe();
  const { data: complaints = [] } = useApi<Complaint[]>("/complaints");
  const { helpers } = useMyHelpers();
  const empty = { subject: "", description: "", helperId: "" };
  const [form, setForm] = useState(empty);
  const submit = useAction(
    () => api("/complaints", { method: "POST", body: { ...form, helperId: form.helperId || undefined } }),
    "Sent — the society admin will reply here",
  );

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Help & complaints" title="Tell the admin what went wrong.">
        Your society admin reviews every complaint and replies on this page. You'll also get an alert.
      </PageHeader>

      <form
        className={`${ui.card} mt-8 space-y-3`}
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate(undefined, { onSuccess: () => setForm(empty) });
        }}
      >
        <p className="font-display text-lg font-semibold tracking-tight">Raise a complaint</p>
        <div className={me?.role === "resident" && helpers.length > 0 ? "grid gap-3 sm:grid-cols-2" : ""}>
          <label className="block">
            <span className={ui.eyebrow}>Subject</span>
            <input
              required
              minLength={3}
              maxLength={120}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="e.g. Helper arrived late"
              className={ui.field}
            />
          </label>
          {me?.role === "resident" && helpers.length > 0 && (
            <label className="block">
              <span className={ui.eyebrow}>About a helper (optional)</span>
              <select value={form.helperId} onChange={(e) => setForm({ ...form, helperId: e.target.value })} className={ui.field}>
                <option value="">Not about a specific helper</option>
                {helpers.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="block">
          <span className={ui.eyebrow}>What happened</span>
          <textarea
            required
            minLength={10}
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Include dates and times if you can (at least 10 characters)."
            className={ui.field}
          />
        </label>
        <button disabled={submit.isPending} className={ui.primaryButton}>
          {submit.isPending ? "Sending…" : "Send to admin"}
        </button>
      </form>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Complaint history</h2>
        {complaints.length === 0 && <Empty>You haven't raised any complaints.</Empty>}
        {complaints.map((c) => (
          <div key={c.id} className={ui.card}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{c.subject}</p>
              <ComplaintChip status={c.status} />
            </div>
            <p className="mt-1 text-sm text-ink-soft">{c.description}</p>
            {c.resolution && (
              <div className={`${ui.row} mt-3`}>
                <p className={ui.eyebrow}>Admin reply</p>
                <p className="mt-1">{c.resolution}</p>
              </div>
            )}
            <p className="mt-2 font-mono text-[11px] text-ink-soft">Raised {dateLabel(c.createdAt.slice(0, 10), true)}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
