import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Empty, Loading, PageHeader, ui } from "@/components/Page";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { Notification } from "@/lib/types";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Alerts — HelpHive" }] }),
  component: () => (
    <AppShell role={["resident", "worker", "admin"]}>
      <Notifications />
    </AppShell>
  ),
});

function Notifications() {
  const router = useRouter();
  const { data, isLoading } = useApi<{ unread: number; items: Notification[] }>("/notifications");
  const readAll = useAction(() => api("/notifications/read-all", { method: "POST" }));
  const read = useAction((id: string) => api(`/notifications/${id}/read`, { method: "POST" }));

  // Clicking an alert marks it read and opens the page it's about.
  function open(n: Notification) {
    if (!n.isRead) read.mutate(n.id);
    if (n.link) router.history.push(n.link);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Alerts" title={data?.unread ? `${data.unread} new alert${data.unread === 1 ? "" : "s"}` : "You're all caught up."}>
        Bookings, check-ins, leave, verification and complaint updates. Click an alert to open it.
      </PageHeader>
      <div className="mt-8 space-y-2">
        {!!data?.unread && (
          <button onClick={() => readAll.mutate()} className={ui.ghostButton}>
            Mark all as read
          </button>
        )}
        {isLoading && <Loading />}
        {data?.items.length === 0 && <Empty>No alerts yet.</Empty>}
        {data?.items.map((n) => (
          <button
            key={n.id}
            onClick={() => open(n)}
            className={`${ui.row} group flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-card ${n.isRead ? "opacity-70" : ""}`}
          >
            <span className={`size-2 shrink-0 rounded-full ${n.isRead ? "bg-line" : "bg-accent"}`} />
            <span className="min-w-0 flex-1">
              <span className={`block ${n.isRead ? "" : "font-medium"}`}>{n.title}</span>
              {n.body && <span className="block truncate text-ink-soft">{n.body}</span>}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-soft">
              {new Date(n.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </span>
            {n.link && <ChevronRight className="size-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" />}
          </button>
        ))}
      </div>
    </div>
  );
}
