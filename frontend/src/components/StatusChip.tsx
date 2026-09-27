import type { ReactNode } from "react";
import type { BookingStatus, HelperStatus } from "@/lib/types";

type Tone = "available" | "booked" | "leave" | "absent" | "neutral";

const tones: Record<Tone, string> = {
  available: "bg-available-soft text-available ring-available/30",
  booked: "bg-booked-soft text-booked ring-booked/30",
  leave: "bg-leave-soft text-leave ring-leave/30",
  absent: "bg-absent-soft text-absent ring-absent/30",
  neutral: "bg-paper text-ink-soft ring-line",
};

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${tones[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const helperStatus: Record<HelperStatus, [Tone, string]> = {
  available: ["available", "Available"],
  booked: ["booked", "Not taking work"],
  leave: ["leave", "On leave"],
};

export function StatusChip({ status }: { status: HelperStatus }) {
  const [tone, label] = helperStatus[status];
  return <Chip tone={tone}>{label}</Chip>;
}

const bookingStatus: Record<BookingStatus, [Tone, string]> = {
  pending: ["booked", "Awaiting helper"],
  confirmed: ["available", "Confirmed"],
  completed: ["neutral", "Completed"],
  rejected: ["absent", "Declined"],
  cancelled: ["absent", "Cancelled"],
};

export function BookingChip({ status }: { status: BookingStatus }) {
  const [tone, label] = bookingStatus[status];
  return <Chip tone={tone}>{label}</Chip>;
}

const complaintTone = { open: "booked", resolved: "available", dismissed: "neutral" } as const;

export function ComplaintChip({ status }: { status: keyof typeof complaintTone }) {
  return <Chip tone={complaintTone[status]}>{status}</Chip>;
}
