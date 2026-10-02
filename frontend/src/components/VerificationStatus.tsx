import { Link } from "@tanstack/react-router";
import { Check, Clock, X } from "lucide-react";

type Status = "pending" | "verified" | "rejected";

const steps = [
  { title: "Profile submitted", hint: "Your details, photo and ID documents are with the society." },
  { title: "Admin checks your ID", hint: "Usually within a day or two. You'll get an alert when it's done." },
  { title: "Residents can book you", hint: "Your profile shows up in search and booking requests start coming in." },
];

/**
 * Where a helper is on the way to going live: submitted → admin review → bookable.
 * Shown at the end of onboarding and on the dashboard until the helper is verified.
 */
export function VerificationStatus({ status, note }: { status: Status; note?: string | null }) {
  // Index of the step currently in progress; 3 means every step is done.
  const current = status === "verified" ? 3 : 1;

  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const done = i < current;
        const failed = status === "rejected" && i === 1;
        const active = i === current && !failed;
        return (
          <li key={s.title} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && (
              <span className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 ${done ? "bg-available" : "bg-line"}`} />
            )}
            <span
              className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ${
                failed
                  ? "bg-absent-soft text-absent ring-absent/40"
                  : done
                    ? "bg-available text-paper ring-available"
                    : active
                      ? "bg-booked-soft text-booked ring-booked/40"
                      : "bg-paper text-ink-soft ring-line"
              }`}
            >
              {failed ? <X className="size-3.5" /> : done ? <Check className="size-3.5" /> : active ? <Clock className="size-3.5" /> : <span className="text-[11px]">{i + 1}</span>}
            </span>
            <div className="pt-0.5">
              <p className={`text-sm font-medium ${done || active || failed ? "text-ink" : "text-ink-soft"}`}>
                {failed ? "Not approved yet" : s.title}
                {active && <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-booked">In progress</span>}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {failed ? (
                  <>
                    {note ? `Admin note: ${note} ` : "The admin couldn't verify your documents. "}
                    <Link to="/worker/profile" className="font-medium text-ink underline">
                      Upload new documents
                    </Link>{" "}
                    to send it back for review.
                  </>
                ) : (
                  s.hint
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
