import { api } from "@/lib/api";
import { clockOf, time12 } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { Visit } from "@/lib/types";
import { Chip } from "./StatusChip";
import { ui } from "./Page";

const stateChip = {
  awaiting: <Chip tone="leave">Not arrived</Chip>,
  inside: <Chip tone="booked">Inside</Chip>,
  done: <Chip tone="available">Done · present</Chip>,
};

/** What a resident sees for today's visit: the door code to read out, and live in/out times. */
export function DoorCode({ visit }: { visit: Visit }) {
  const newCode = useAction(
    () => api("/visits/new-code", { method: "POST", body: { bookingId: visit.bookingId } }),
    "New door code issued",
  );

  return (
    <div className={`${ui.card} settle`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {visit.helper.name}
          <span className="ml-2 font-mono text-xs text-ink-soft">
            {time12(visit.startTime)}–{time12(visit.endTime)}
          </span>
        </p>
        {stateChip[visit.state]}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div>
          <p className={ui.eyebrow}>Today's door code</p>
          <p className="font-display text-4xl font-bold tracking-[0.3em]">{visit.state === "done" ? "····" : visit.doorCode}</p>
        </div>
        <div className="ml-auto text-right text-sm">
          <p className="font-mono text-xs text-ink-soft">
            In {clockOf(visit.checkInAt)} · Out {clockOf(visit.checkOutAt)}
          </p>
          {visit.state !== "done" && (
            <button onClick={() => newCode.mutate()} disabled={newCode.isPending} className={`${ui.ghostButton} mt-2`}>
              New code
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Read this out when {visit.helper.name.split(" ")[0]} arrives and again when they leave. Only the helper enters it.
      </p>
    </div>
  );
}
