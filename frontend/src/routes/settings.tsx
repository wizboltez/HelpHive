import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { BuildingSelect, PasswordInput } from "@/components/Fields";
import { Loading, PageHeader, ui } from "@/components/Page";
import { api } from "@/lib/api";
import { useAction, useMe } from "@/lib/hooks";
import type { User } from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — HelpHive" }] }),
  component: () => (
    <AppShell role={["resident", "worker", "admin"]}>
      <Settings />
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

function Settings() {
  const { data: me } = useMe();
  if (!me) return <Loading />;
  return (
    <>
      <PageHeader eyebrow="Settings" title="Your account." />
      <div className="mt-8 grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
        <Account key={JSON.stringify(me)} me={me} />
        <Password />
      </div>
    </>
  );
}

function Account({ me }: { me: User }) {
  const [form, setForm] = useState({ name: me.name, phone: me.phone, building: me.building ?? "", place: me.place });
  const isWorker = me.role === "worker";
  const save = useAction(
    () =>
      api("/auth/me", {
        method: "PATCH",
        body: {
          ...(isWorker ? {} : { name: form.name }),
          phone: form.phone,
          ...(me.role !== "admin" && { building: form.building }),
          ...(me.role === "resident" && { place: form.place }),
        },
      }),
    "Account updated",
  );

  return (
    <Section title="Account details">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="block">
          <span className={ui.eyebrow}>Full name</span>
          <input
            required
            disabled={isWorker}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={`${ui.field} disabled:opacity-60`}
          />
          {isWorker && (
            <span className="mt-1 block text-xs text-ink-soft">
              Your name is part of your public profile. Change it from{" "}
              <Link to="/worker/profile" className="underline">
                My profile
              </Link>
              .
            </span>
          )}
        </label>
        <label className="block">
          <span className={ui.eyebrow}>Email</span>
          <input disabled value={me.email} className={`${ui.field} opacity-60`} />
        </label>
        <label className="block">
          <span className={ui.eyebrow}>Username</span>
          <input disabled value={me.username} className={`${ui.field} opacity-60`} />
        </label>
        <label className="block">
          <span className={ui.eyebrow}>Mobile number</span>
          <input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={ui.field} />
        </label>
        {me.role !== "admin" && (
          <div className={me.role === "resident" ? "grid grid-cols-[1fr_120px] gap-2" : ""}>
            <label className="block">
              <span className={ui.eyebrow}>{me.role === "resident" ? "Building" : "Building you work in"}</span>
              <BuildingSelect required value={form.building} onChange={(building) => setForm({ ...form, building })} />
            </label>
            {me.role === "resident" && (
              <label className="block">
                <span className={ui.eyebrow}>Flat no.</span>
                <input required value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} className={ui.field} />
              </label>
            )}
          </div>
        )}
        <button disabled={save.isPending} className={ui.darkButton}>
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Section>
  );
}

function Password() {
  const empty = { currentPassword: "", newPassword: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;
  const save = useAction(
    () => api("/auth/me/password", { method: "POST", body: { currentPassword: form.currentPassword, newPassword: form.newPassword } }),
    "Password changed",
  );

  return (
    <Section title="Change password" hint="Use at least 8 characters.">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined, { onSuccess: () => setForm(empty) });
        }}
      >
        <label className="block">
          <span className={ui.eyebrow}>Current password</span>
          <PasswordInput required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" />
        </label>
        <label className="block">
          <span className={ui.eyebrow}>New password</span>
          <PasswordInput required minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" />
        </label>
        <label className="block">
          <span className={ui.eyebrow}>Confirm new password</span>
          <PasswordInput required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" />
          {mismatch && <span className="mt-1 block text-xs text-absent">Passwords don't match</span>}
        </label>
        <button disabled={save.isPending || mismatch || form.newPassword.length < 8} className={ui.darkButton}>
          Change password
        </button>
      </form>
    </Section>
  );
}
