import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { homeFor, useMe } from "@/lib/hooks";

/** Layout for public information pages (About, Privacy, Terms). Works signed in or out. */
export function StaticPage({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated?: string; children: ReactNode }) {
  const { data: me } = useMe();
  const home = me ? homeFor(me.role) : "/";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link to={home} className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="font-display text-xl font-bold tracking-tight">HelpHive</span>
          </Link>
          <Link to={home} className="text-sm text-ink-soft hover:text-ink">
            {me ? "Back to dashboard" : "Sign up"} →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">{eyebrow}</p>
        <h1 className="mt-2 text-balance font-display text-4xl font-bold tracking-tight">{title}</h1>
        {updated && <p className="mt-2 text-sm text-ink-soft">Last updated {updated}</p>}
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-pretty [&_ul]:space-y-1.5">
          {children}
        </div>
        <footer className="mt-16 flex gap-4 border-t border-line pt-6 text-xs text-ink-soft">
          <Link to="/about" className="hover:text-ink">About</Link>
          <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          <Link to="/terms" className="hover:text-ink">Terms</Link>
        </footer>
      </main>
    </div>
  );
}
