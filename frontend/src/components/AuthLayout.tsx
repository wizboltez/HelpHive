import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { homeFor, useMe } from "@/lib/hooks";

/** Frame for the sign-up and login pages. Already signed-in users go straight to their dashboard. */
export function AuthLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  useEffect(() => {
    if (me) navigate({ to: homeFor(me.role), replace: true });
  }, [me, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6 py-12 text-ink">
      <div className="w-full max-w-md">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">HelpHive</p>
        <h1 className="mt-2 text-balance font-display text-4xl font-bold tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-3 max-w-[46ch] text-pretty text-ink-soft">{intro}</p>
        {children}
      </div>
    </div>
  );
}

/** Lists the backend's per-field validation messages under a form. */
export function FieldErrors({ error }: { error: Error | null }) {
  const details = error instanceof ApiError ? (error.details as { field: string; message: string }[] | undefined) : undefined;
  if (!error) return null;
  return (
    <div className="rounded-xl bg-absent-soft px-3 py-2.5 text-sm text-absent ring-1 ring-absent/30">
      <p>{error.message}</p>
      {Array.isArray(details) && (
        <ul className="mt-1 list-disc pl-4 text-xs">
          {details.map((d) => (
            <li key={d.field + d.message}>
              <span className="capitalize">{d.field}</span>: {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
