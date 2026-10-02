import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, FileText, Info, LifeBuoy, LogOut, Settings, Shield, UserRound } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getToken } from "@/lib/api";
import { addressOf } from "@/lib/format";
import { homeFor, useApi, useMe, useSession } from "@/lib/hooks";
import type { Role, User } from "@/lib/types";
import { Avatar, Loading } from "./Page";

const nav: Record<Role, { to: string; label: string }[]> = {
  resident: [
    { to: "/helpers", label: "Find helpers" },
    { to: "/schedule", label: "Attendance" },
    { to: "/bookings", label: "Bookings" },
  ],
  worker: [
    { to: "/worker/requests", label: "House requests" },
    { to: "/worker/earnings", label: "Earnings" },
    { to: "/worker/profile", label: "Profile" },
  ],
  admin: [],
};

/**
 * Page frame for signed-in users. Sends signed-out visitors to /login, users with a
 * different role to their own home, and helpers who haven't finished setup to onboarding.
 * `minimal` hides the navigation (used by onboarding itself).
 */
export function AppShell({ role, minimal, children }: { role: Role | Role[]; minimal?: boolean; children: ReactNode }) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const allowed = Array.isArray(role) ? role : [role];
  const allowedHere = !!me && allowed.includes(me.role);
  const needsOnboarding = me?.role === "worker" && !me.onboarded && !minimal;

  useEffect(() => {
    if (!getToken()) navigate({ to: "/login", replace: true });
    else if (me && !allowedHere) navigate({ to: homeFor(me.role), replace: true });
    else if (needsOnboarding) navigate({ to: "/worker/onboarding", replace: true });
  }, [me, allowedHere, needsOnboarding, navigate]);

  if (!me || !allowedHere || needsOnboarding) {
    return (
      <div className="min-h-screen bg-paper pt-24">
        <Loading />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link to={homeFor(me.role)} className="flex items-center gap-2" aria-label="Go to your dashboard">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="font-display text-xl font-bold tracking-tight">HelpHive</span>
          </Link>
          {!minimal && (
            <nav className="hidden items-center gap-1 text-sm md:flex">
              {nav[me.role].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeProps={{ className: "bg-card text-ink ring-1 ring-line" }}
                  inactiveProps={{ className: "text-ink-soft hover:text-ink" }}
                  className="rounded-lg px-3 py-1.5 font-medium transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!minimal && <NotificationBell />}
            <AccountMenu me={me} minimal={minimal} />
          </div>
        </div>
        {!minimal && nav[me.role].length > 0 && (
          <nav className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 text-sm md:hidden">
            {nav[me.role].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-card text-ink ring-1 ring-line" }}
                inactiveProps={{ className: "text-ink-soft" }}
                className="shrink-0 rounded-lg px-3 py-1.5 font-medium"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {children}
        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-xs text-ink-soft">
          <span>© {new Date().getFullYear()} HelpHive · Everyone accounted for, by the hour.</span>
          <span className="flex gap-4">
            <Link to="/about" className="hover:text-ink">About</Link>
            <Link to="/privacy" className="hover:text-ink">Privacy</Link>
            <Link to="/terms" className="hover:text-ink">Terms</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}

function NotificationBell() {
  const { data } = useApi<{ unread: number }>("/notifications", { refetchInterval: 30_000 });
  const unread = data?.unread ?? 0;
  return (
    <Link
      to="/notifications"
      aria-label={unread ? `${unread} unread alerts` : "Alerts"}
      activeProps={{ className: "bg-card ring-1 ring-line text-ink" }}
      className="relative grid size-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-card hover:text-ink"
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-paper">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

function AccountMenu({ me, minimal }: { me: User; minimal?: boolean | undefined }) {
  const navigate = useNavigate();
  const { signOut } = useSession();
  const go = (to: string) => navigate({ to });

  const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink focus:bg-paper focus:text-ink";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none ring-offset-2 ring-offset-paper transition focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Avatar name={me.name} photoUrl={me.photoUrl} className="size-10 rounded-full text-sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-2xl border-line bg-card p-1.5 text-ink">
        <DropdownMenuLabel className="px-2.5 py-2 font-normal">
          <p className="font-medium text-ink">{me.name}</p>
          <p className="truncate text-xs text-ink-soft">{me.email}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            {me.role === "worker" ? "Helper" : me.role} {addressOf(me) && `· ${addressOf(me)}`}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-line" />
        {me.role === "worker" && !minimal && (
          <DropdownMenuItem className={item} onSelect={() => go("/worker/profile")}>
            <UserRound className="size-4 text-ink-soft" /> My profile
          </DropdownMenuItem>
        )}
        {!minimal && (
          <DropdownMenuItem className={item} onSelect={() => go("/settings")}>
            <Settings className="size-4 text-ink-soft" /> Settings
          </DropdownMenuItem>
        )}
        {me.role !== "admin" && !minimal && (
          <DropdownMenuItem className={item} onSelect={() => go("/complaints")}>
            <LifeBuoy className="size-4 text-ink-soft" /> Help & complaints
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem className={item} onSelect={() => go("/about")}>
          <Info className="size-4 text-ink-soft" /> About HelpHive
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => go("/privacy")}>
          <Shield className="size-4 text-ink-soft" /> Privacy policy
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => go("/terms")}>
          <FileText className="size-4 text-ink-soft" /> Terms of service
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem className={`${item} text-absent focus:text-absent`} onSelect={signOut}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
