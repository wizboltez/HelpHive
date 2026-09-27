import type { ReactNode } from "react";
import { fileUrl } from "@/lib/api";
import { initials } from "@/lib/format";

/** Shared class names so every page looks the same. */
export const ui = {
  card: "rounded-2xl bg-card p-5 ring-1 ring-line",
  row: "rounded-xl bg-paper px-3 py-2.5 text-sm ring-1 ring-line",
  eyebrow: "font-mono text-[10px] uppercase tracking-widest text-ink-soft",
  field:
    "mt-1 w-full rounded-xl bg-paper px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-accent",
  primaryButton:
    "rounded-xl bg-accent px-4 py-3 text-sm font-medium text-paper transition-colors hover:bg-ink disabled:opacity-50",
  darkButton:
    "rounded-lg bg-ink px-3 py-2 text-xs font-medium text-paper transition-colors hover:bg-accent disabled:opacity-50",
  ghostButton:
    "rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-soft transition-colors hover:text-accent disabled:opacity-50",
};

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <section className="max-w-2xl">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-soft">{eyebrow}</p>
      <h1 className="text-balance font-display text-4xl font-bold tracking-tight">{title}</h1>
      {children && <div className="mt-3 max-w-[52ch] text-pretty text-ink-soft">{children}</div>}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={`${ui.row} py-4 text-center text-ink-soft`}>{children}</p>;
}

export function Loading() {
  return <p className="py-6 text-center font-mono text-xs text-ink-soft">Loading…</p>;
}

export function ErrorNote({ error }: { error: Error | null }) {
  if (!error) return null;
  return <p className="rounded-xl bg-absent-soft px-3 py-2.5 text-sm text-absent ring-1 ring-absent/30">{error.message}</p>;
}

/** Profile photo, or initials when there isn't one. */
export function Avatar({ name, photoUrl, className = "size-9 rounded-full" }: { name: string; photoUrl?: string | null | undefined; className?: string }) {
  const src = fileUrl(photoUrl);
  return src ? (
    <img src={src} alt={name} className={`${className} shrink-0 object-cover`} />
  ) : (
    <span className={`${className} grid shrink-0 place-items-center bg-accent-soft font-display font-semibold text-accent`}>
      {initials(name)}
    </span>
  );
}
