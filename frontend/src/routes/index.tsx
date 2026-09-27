import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout, FieldErrors } from "@/components/AuthLayout";
import { BuildingSelect, PasswordInput } from "@/components/Fields";
import { ui } from "@/components/Page";
import { api } from "@/lib/api";
import { useMeta, useSession } from "@/lib/hooks";
import type { User } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HelpHive — Create your account" },
      {
        name: "description",
        content: "Create a HelpHive account as a resident or a domestic helper: verified helpers, bookings and door-code attendance.",
      },
    ],
  }),
  component: CreateAccount,
});

function CreateAccount() {
  const { signIn } = useSession();
  const { data: meta } = useMeta();
  const [role, setRole] = useState<"resident" | "worker">("resident");
  const [form, setForm] = useState({ name: "", username: "", email: "", phone: "", building: "", place: "", password: "" });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const domains = meta?.emailDomains ?? [];
  const emailDomain = form.email.split("@")[1]?.toLowerCase();
  const emailProblem =
    form.email.includes("@") && emailDomain && domains.length && !domains.includes(emailDomain)
      ? `Use an address ending in ${domains.map((d) => `@${d}`).join(" or ")}`
      : null;

  const register = useMutation({
    mutationFn: () =>
      api<{ token: string; user: User }>("/auth/register", {
        method: "POST",
        body: { ...form, role, place: role === "resident" ? form.place : "" },
      }),
    onSuccess: ({ token, user }) => signIn(token, user),
  });

  const text = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className={ui.eyebrow}>{label}</span>
      <input required value={form[key]} onChange={(e) => set(key, e.target.value)} className={ui.field} {...props} />
    </label>
  );

  return (
    <AuthLayout
      title="Everyone accounted for, by the hour."
      intro="Join your society on HelpHive. Residents book verified help and track attendance; helpers choose the houses they work in."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!emailProblem) register.mutate();
        }}
        className="settle mt-8 space-y-4 rounded-2xl bg-card p-5 ring-1 ring-line"
      >
        <div>
          <span className={ui.eyebrow}>I am a</span>
          <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-paper p-1 text-sm ring-1 ring-line">
            {(
              [
                { value: "resident", text: "Resident" },
                { value: "worker", text: "Domestic helper" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRole(option.value)}
                className={`rounded-lg py-2 font-medium transition-colors ${role === option.value ? "bg-card ring-1 ring-line" : "text-ink-soft hover:text-ink"}`}
              >
                {option.text}
              </button>
            ))}
          </div>
        </div>

        {text("name", "Full name", { placeholder: "Anannya Rao", autoComplete: "name" })}
        {text("username", "Username", { placeholder: "anannya", autoComplete: "username" })}
        <label className="block">
          <span className={ui.eyebrow}>Email address</span>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder={domains[0] ? `you@${domains[0]}` : "you@gmail.com"}
            autoComplete="email"
            className={`${ui.field} ${emailProblem ? "ring-absent" : ""}`}
          />
          <span className={`mt-1 block text-xs ${emailProblem ? "text-absent" : "text-ink-soft"}`}>
            {emailProblem ?? (domains.length ? `We accept ${domains.map((d) => `@${d}`).join(" and ")} addresses.` : "")}
          </span>
        </label>
        {text("phone", "Mobile number", { type: "tel", placeholder: "+91 98200 41022", autoComplete: "tel" })}

        <div className={role === "resident" ? "grid grid-cols-[1fr_120px] gap-2" : ""}>
          <label className="block">
            <span className={ui.eyebrow}>{role === "resident" ? "Building" : "Building you work in"}</span>
            <BuildingSelect required value={form.building} onChange={(v) => set("building", v)} />
          </label>
          {role === "resident" && text("place", "Flat no.", { placeholder: "402" })}
        </div>

        <label className="block">
          <span className={ui.eyebrow}>Password (8+ characters)</span>
          <PasswordInput required minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" autoComplete="new-password" />
        </label>

        {role === "worker" && (
          <p className="rounded-xl bg-paper px-3 py-2.5 text-xs text-ink-soft ring-1 ring-line">
            Next you'll set up your profile and upload an ID document. The society admin verifies you before residents can book you.
          </p>
        )}
        <FieldErrors error={register.error} />
        <button type="submit" disabled={register.isPending || !!emailProblem} className={`${ui.primaryButton} w-full`}>
          {register.isPending ? "Creating account…" : "Create account"}
        </button>
        <p className="text-center text-[11px] text-ink-soft">
          By signing up you agree to our{" "}
          <Link to="/terms" className="underline hover:text-ink">Terms</Link> and{" "}
          <Link to="/privacy" className="underline hover:text-ink">Privacy policy</Link>.
        </p>
      </form>

      <p className="mt-4 text-sm text-ink-soft">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-accent hover:text-ink">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
