import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { rupees, workHoursLabel } from "@/lib/format";
import type { Helper } from "@/lib/types";
import { CategoryChips } from "./Fields";
import { Avatar } from "./Page";
import { StatusChip } from "./StatusChip";

export function HelperCard({ helper, delay = 0 }: { helper: Helper; delay?: number }) {
  return (
    <Link
      to="/helpers/$helperId"
      params={{ helperId: helper.slug }}
      className="settle group block rounded-2xl bg-card p-4 ring-1 ring-line transition-transform hover:-translate-y-1"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex gap-3">
        <Avatar name={helper.name} photoUrl={helper.photoUrl} className="size-16 rounded-xl text-lg" />
        <div className="min-w-0">
          <p className="font-medium leading-tight">{helper.name}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {helper.reviewCount ? (
              <>
                {helper.rating} <span className="text-booked">★</span> · {helper.reviewCount} review{helper.reviewCount === 1 ? "" : "s"}
              </>
            ) : (
              "New helper"
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusChip status={helper.status} />
          </div>
        </div>
      </div>
      <div className="mt-3">
        <CategoryChips categories={helper.categories} limit={3} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft">
        <Clock className="size-3" /> {workHoursLabel(helper)}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-soft">
        <span className="font-mono">
          {rupees(helper.ratePerVisit)}/visit{helper.area && ` · ${helper.area}`}
        </span>
        <span className="transition-colors group-hover:text-accent">View profile →</span>
      </div>
    </Link>
  );
}
