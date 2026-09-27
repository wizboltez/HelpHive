import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout, FieldErrors } from "@/components/AuthLayout";
import { PasswordInput } from "@/components/Fields";
import { ui } from "@/components/Page";
import { api } from "@/lib/api";
import { useSession } from "@/lib/hooks";
import type { User } from "@/lib/types";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in — HelpHive" }] }),
  component: Login,
});

function Login() {
  const { signIn } = useSession();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  const submit = useMutation({
    mutationFn: () => api<{ token: string; user: User }>("/auth/login", { method: "POST", body: { login, password } }),
    onSuccess: ({ token, user }) => signIn(token, user),
  });

  return (
    <AuthLayout title="Welcome back." intro="Log in with your username or email.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
        className="settle mt-8 space-y-4 rounded-2xl bg-card p-5 ring-1 ring-line"
      >
        <label className="block">
          <span className={ui.eyebrow}>Username or email</span>
          <input required value={login} onChange={(e) => setLogin(e.target.value)} className={ui.field} autoComplete="username" />
        </label>
        <label className="block">
          <span className={ui.eyebrow}>Password</span>
          <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <FieldErrors error={submit.error} />
        <button type="submit" disabled={submit.isPending} className={`${ui.primaryButton} w-full`}>
          {submit.isPending ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink-soft">
        New to HelpHive?{" "}
        <Link to="/" className="font-medium text-accent hover:text-ink">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
