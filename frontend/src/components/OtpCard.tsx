import { useState } from "react";
import { api } from "@/lib/api";
import { clockOf, time12 } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { Visit } from "@/lib/types";

/**
 * The helper's door-code entry for one visit today: once to check in, once to check out.
 * The code is verified by the server; completing both marks the day present.
 */
export function OtpCard({ visit }: { visit: Visit }) {
  const [code, setCode] = useState("");
  const stage = visit.state;
  const action = stage === "inside" ? "check-out" : "check-in";

  const submit = useAction(
    () => api(`/visits/${action}`, { method: "POST", body: { bookingId: visit.bookingId, code } }),
    stage === "inside" ? "Checked out — day marked present" : "Checked in",
  );

  return (
    <div className="relative max-w-md">
      <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl bg-card/60 ring-1 ring-line" />
      <div className="settle relative rounded-2xl bg-card p-5 ring-1 ring-line">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-ink-soft">
            {visit.flat} · {time12(visit.startTime)}–{time12(visit.endTime)}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
              stage === "done"
                ? "bg-available-soft text-available ring-available/30"
                : stage === "inside"
                  ? "bg-booked-soft text-booked ring-booked/30"
                  : "bg-leave-soft text-leave ring-leave/30"
            }`}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {stage === "done" ? "Day complete" : stage === "inside" ? "Inside" : "At the door"}
          </span>
        </div>

        <p className="mt-3 text-sm text-ink-soft">
          {stage === "done"
            ? "In and out both verified — attendance marked present."
            : stage === "inside"
              ? `When your work is done, ask ${visit.resident.name} for the new leaving code. The arrival code won't work again.`
              : `Ask ${visit.resident.name} for today's door code to start your hours.`}
        </p>

        {stage !== "done" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate(undefined, { onSuccess: () => setCode("") });
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="0000"
              aria-label="Door code"
              className={`mt-4 w-full rounded-xl bg-paper px-3 py-3 text-center font-display text-3xl font-bold tracking-[0.5em] outline-none ring-1 focus:ring-accent ${
                submit.isError ? "ring-absent" : "ring-line"
              }`}
            />
            {submit.error && <p className="mt-1.5 text-xs text-absent">{submit.error.message}</p>}
            <button
              disabled={code.length !== 4 || submit.isPending}
              className="mt-3 w-full rounded-xl bg-ink py-3 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:opacity-50"
            >
              {stage === "inside" ? "Verify & check out" : "Verify & check in"}
            </button>
          </form>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-paper px-3 py-2.5 ring-1 ring-line">
            <p className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">In</p>
            <p className="font-mono">{clockOf(visit.checkInAt)}</p>
          </div>
          <div className="rounded-xl bg-paper px-3 py-2.5 ring-1 ring-line">
            <p className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">Out</p>
            <p className="font-mono">{clockOf(visit.checkOutAt)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
