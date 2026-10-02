// Shapes of the data the backend returns.

export type Role = "resident" | "worker" | "admin";
export type HelperStatus = "available" | "booked" | "leave";
export type Plan = "one_time" | "weekly" | "monthly";
export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
export type AttendanceState = "present" | "absent" | "leave" | "none";

export type User = {
  id: string;
  role: Role;
  name: string;
  username: string;
  email: string;
  phone: string;
  building: string | null;
  place: string;
  helperSlug?: string | null;
  verification?: "pending" | "verified" | "rejected" | null;
  onboarded?: boolean | null;
  photoUrl?: string | null;
};

/** Public lists from GET /meta. */
export type Meta = { buildings: string[]; categories: string[]; emailDomains: string[] };

export type Service = { id: string; label: string; price: number; unit: "visit" | "event"; isAvailable: boolean };

/** Regular working hours, e.g. Mon–Sat 08:00–18:00. */
export type WorkHours = { workDays: string[]; workStart: string; workEnd: string };

export type Helper = WorkHours & {
  id: string;
  slug: string;
  name: string;
  categories: string[];
  summary: string;
  area: string | null;
  photoUrl: string | null;
  ratePerVisit: number;
  rating: number;
  reviewCount: number;
  status: HelperStatus;
};

export type HelperProfile = Helper & {
  houses: { flat: string; days: string[]; startTime: string; endTime: string }[];
  services: Service[];
  reviews: { stars: number; comment: string; residentName: string; flat: string; createdAt: string }[];
  hoursLast30Days: number;
  nextLeave: { startDate: string; endDate: string } | null;
};

export type Extra = { id: string; label: string; unit: "visit" | "event"; price: number; amount: number };

export type Quote = {
  startDate: string;
  endDate: string;
  days: string[];
  visits: number;
  ratePerVisit: number;
  base: number;
  extras: Extra[];
  fee: number;
  total: number;
};

export type Booking = {
  id: string;
  plan: Plan;
  flat: string;
  startDate: string;
  endDate: string;
  days: string[];
  startTime: string;
  endTime: string;
  visits: number;
  ratePerVisit: number;
  extras: Extra[];
  total: number;
  status: BookingStatus;
  notes: string;
  cancelReason: string | null;
  createdAt: string;
  residentId: string;
  residentName: string;
  helperId: string;
  helperName: string;
  helperSlug: string;
  cancellable: boolean;
};

export type BookingDetail = Booking & {
  schedule: { date: string; state: "done" | "inside" | "missed" | "upcoming"; checkInAt: string | null; checkOutAt: string | null }[];
};

export type Visit = {
  bookingId: string;
  date: string;
  flat: string;
  startTime: string;
  endTime: string;
  helper: { id: string; name: string; slug: string };
  resident: { id: string; name: string };
  state: "awaiting" | "inside" | "done";
  checkInAt: string | null;
  checkOutAt: string | null;
  doorCode?: string;
};

export type Attendance = {
  helperId: string;
  month: string;
  days: { date: string; state: AttendanceState }[];
  totals: { present: number; absent: number; leave: number };
};

export type ServiceDraft = Omit<Service, "id">;

export type ProfileChanges = {
  name?: string;
  categories?: string[];
  summary?: string;
  ratePerVisit?: number;
  services?: ServiceDraft[];
  photoFile?: string;
};

export type ProfileChange = {
  id: string;
  changes: ProfileChanges;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

/** One week of a helper's schedule. Other residents' slots are labelled just "Booked". */
export type Schedule = WorkHours & {
  from: string;
  to: string;
  days: {
    date: string;
    weekday: string;
    working: boolean;
    onLeave: boolean;
    slots: { startTime: string; endTime: string; status: "confirmed" | "pending"; label: string }[];
  }[];
};

export type HelperDocument = { id: string; docType: string; docLabel: string | null; mimeType: string; createdAt: string };

export type WorkerProfile = WorkHours & {
  name: string;
  slug: string;
  categories: string[];
  summary: string;
  ratePerVisit: number;
  isAccepting: boolean;
  verification: "pending" | "verified" | "rejected";
  verificationNote: string | null;
  onboarded: boolean;
  photoUrl: string | null;
  services: Service[];
  documents: HelperDocument[];
  leaves: { id: string; startDate: string; endDate: string; reason: string }[];
  latestChange: ProfileChange | null;
};

export type Earnings = {
  from: string;
  to: string;
  totalVisits: number;
  totalAmount: number;
  byHouse: { bookingId: string; flat: string; plan: Plan; visits: number; amount: number }[];
};

export type Notification = { id: string; title: string; body: string; link: string | null; isRead: boolean; createdAt: string };

export type Complaint = {
  id: string;
  subject: string;
  description: string;
  status: "open" | "resolved" | "dismissed";
  resolution: string | null;
  helperId: string | null;
  bookingId: string | null;
  raisedBy: string;
  raisedByName: string;
  createdAt: string;
};
