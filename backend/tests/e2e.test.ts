import { rm } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { connectPglite, type Db } from "../src/db/db.js";
import { migrate } from "../src/db/migrate.js";
import { hashPassword } from "../src/lib/auth.js";

/**
 * One realistic story through the whole API, on a fresh in-memory Postgres.
 * The clock is controlled so we can walk through the days of a booking.
 */

let db: Db;
let app: ReturnType<typeof createApp>;

const setNow = (isoWithOffset: string) => vi.setSystemTime(new Date(isoWithOffset));

function as(token: string) {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body: object = {}) => request(app).post(url).set(auth).send(body),
    patch: (url: string, body: object) => request(app).patch(url).set(auth).send(body),
    put: (url: string, body: object) => request(app).put(url).set(auth).send(body),
    upload: (method: "post" | "put", url: string) => request(app)[method](url).set(auth),
  };
}

async function register(role: "resident" | "worker", username: string, place: string) {
  const res = await request(app).post("/api/auth/register").send({
    role,
    name: username === "sunita" ? "Sunita Devi" : `User ${username}`,
    username,
    email: `${username}@gmail.com`,
    phone: "+91 98200 41022",
    building: "Tower A",
    place,
    password: "correct-horse-1",
  });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, user: res.body.user };
}

/** Titles of a user's notifications, newest first. */
const notificationTitles = async (actor: ReturnType<typeof as>) =>
  (await actor.get("/api/notifications")).body.items.map((n: { title: string }) => n.title);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = Buffer.from("%PDF-1.4\n%fake but well-formed header\n");

// Actors and ids shared across the story
let admin: ReturnType<typeof as>;
let meera: ReturnType<typeof as>; // resident, flat A-402
let ravi: ReturnType<typeof as>; // resident, flat B-118
let sunita: ReturnType<typeof as>; // helper
let sunitaId: string;
let raviUserId: string;
let chapatiServiceId: string;
let eventServiceId: string;
let bookingId: string;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow("2026-10-05T08:00:00+05:30"); // Monday
  config.bcryptRounds = 4; // faster hashing for tests

  db = await connectPglite();
  await migrate(db);
  app = createApp(db);

  await db.query(
    `INSERT INTO users (role, name, username, email, phone, password_hash)
     VALUES ('admin', 'Admin', 'admin', 'admin@example.com', '+91 90000 00000', $1)`,
    [await hashPassword("admin-password-1")],
  );
  const login = await request(app).post("/api/auth/login").send({ login: "admin", password: "admin-password-1" });
  admin = as(login.body.token);
});

afterAll(async () => {
  vi.useRealTimers();
  await db.close();
  await rm(config.uploadDir, { recursive: true, force: true });
});

describe("HelpHive end to end", () => {
  it("is healthy", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body).toEqual({ status: "ok" });
  });

  it("lets the admin set up the society's buildings", async () => {
    expect((await admin.post("/api/admin/buildings", { name: "Tower A" })).status).toBe(201);
    expect((await admin.post("/api/admin/buildings", { name: "Tower A" })).status).toBe(409);
    const meta = await request(app).get("/api/meta");
    expect(meta.body).toMatchObject({ buildings: ["Tower A"], emailDomains: ["gmail.com", "outlook.com"] });
    expect(meta.body.categories).toContain("Cooking");
  });

  it("registers and logs in residents and helpers", async () => {
    const bad = await request(app).post("/api/auth/register").send({ role: "resident", username: "x" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("validation_error");

    const base = { role: "resident", name: "Test", phone: "+91 98200 41022", password: "correct-horse-1" };
    const wrongDomain = await request(app).post("/api/auth/register")
      .send({ ...base, username: "yahoo", email: "someone@yahoo.com", building: "Tower A", place: "1" });
    expect(wrongDomain.body.error.details[0].message).toMatch(/@gmail.com or @outlook.com/);
    const unknownBuilding = await request(app).post("/api/auth/register")
      .send({ ...base, username: "nowhere", email: "nowhere@gmail.com", building: "Tower Z", place: "1" });
    expect(unknownBuilding.status).toBe(400);

    const m = await register("resident", "meera", "A-402");
    const r = await register("resident", "ravi", "B-118");
    const s = await register("worker", "sunita", "A & B wing");
    meera = as(m.token);
    ravi = as(r.token);
    sunita = as(s.token);
    sunitaId = s.user.id;
    raviUserId = r.user.id;

    const duplicate = await request(app).post("/api/auth/register").send({
      role: "resident", name: "Meera again", username: "MEERA", email: "other@gmail.com",
      phone: "+91 98200 41022", building: "Tower A", place: "A-1", password: "correct-horse-1",
    });
    expect(duplicate.status).toBe(409);

    const byEmail = await request(app).post("/api/auth/login").send({ login: "Meera@Gmail.com", password: "correct-horse-1" });
    expect(byEmail.status).toBe(200);
    const wrong = await request(app).post("/api/auth/login").send({ login: "meera", password: "nope-nope" });
    expect(wrong.status).toBe(401);

    const meRes = await sunita.get("/api/auth/me");
    expect(meRes.body).toMatchObject({ role: "worker", helperSlug: "sunita-devi", verification: "pending", onboarded: false });
    expect(meRes.body.password_hash).toBeUndefined();

    expect((await request(app).get("/api/bookings")).status).toBe(401);
  });

  it("keeps unverified helpers out of search", async () => {
    expect((await meera.get("/api/helpers")).body).toEqual([]);
    expect((await meera.get("/api/helpers/sunita-devi")).status).toBe(404);
    expect((await sunita.get("/api/helpers/sunita-devi")).status).toBe(200); // can see own profile
  });

  it("onboards a new helper: profile, services, photo and documents", async () => {
    // Before verification, edits apply straight away.
    const details = await sunita.patch("/api/worker/profile", {
      categories: ["Housekeeping", "Cooking"], summary: "Chapatis & event food", ratePerVisit: 400,
    });
    expect(details.body.queued).toBe(false);
    expect((await sunita.patch("/api/worker/profile", { categories: ["Plumbing"] })).status).toBe(400);

    await sunita.put("/api/worker/services", {
      services: [
        { label: "Daily chapatis", price: 180, unit: "visit" },
        { label: "Event & function food help", price: 1200, unit: "event" },
      ],
    });
    const photo = await sunita.upload("put", "/api/worker/photo").attach("file", PNG, { filename: "me.png", contentType: "image/png" });
    expect(photo.body.queued).toBe(false);

    const profile = (await sunita.get("/api/worker/profile")).body;
    expect(profile).toMatchObject({ categories: ["Housekeeping", "Cooking"], ratePerVisit: 400, onboarded: false });
    chapatiServiceId = profile.services.find((s: any) => s.unit === "visit").id;
    eventServiceId = profile.services.find((s: any) => s.unit === "event").id;
    expect((await request(app).get(profile.photoUrl)).status).toBe(200);

    // Onboarding can't finish without an ID document.
    expect((await sunita.post("/api/worker/onboarding/complete")).status).toBe(400);

    const fake = await sunita.upload("post", "/api/worker/documents").field("docType", "id_proof")
      .attach("file", Buffer.from("not a pdf"), { filename: "id.pdf", contentType: "application/pdf" });
    expect(fake.status).toBe(400);

    const doc = await sunita.upload("post", "/api/worker/documents").field("docType", "id_proof")
      .attach("file", PDF, { filename: "aadhaar.pdf", contentType: "application/pdf" });
    expect(doc.status).toBe(201);
    expect((await sunita.get(`/api/worker/documents/${doc.body.id}/file`)).status).toBe(200);

    const unnamed = await sunita.upload("post", "/api/worker/documents").field("docType", "other")
      .attach("file", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    expect(unnamed.status).toBe(400);
    const named = await sunita.upload("post", "/api/worker/documents").field("docType", "other")
      .field("docLabel", "Society ID card").attach("file", PDF, { filename: "card.pdf", contentType: "application/pdf" });
    expect(named.body.docLabel).toBe("Society ID card");

    expect((await admin.get("/api/admin/helpers?verification=pending")).body).toHaveLength(0); // still onboarding
    expect((await sunita.post("/api/worker/onboarding/complete")).body.onboarded).toBe(true);
    const [alert] = (await admin.get("/api/notifications")).body.items;
    expect(alert).toMatchObject({ title: "New helper to verify", link: "/admin?tab=verification" });
  });

  it("lets an admin review documents and verify the helper", async () => {
    expect((await meera.get("/api/admin/stats")).status).toBe(403);
    expect((await admin.get("/api/admin/stats")).body.pendingVerifications).toBe(1);

    const pending = await admin.get("/api/admin/helpers?verification=pending");
    expect(pending.body).toHaveLength(1);
    const [doc] = pending.body[0].documents;
    expect((await admin.get(`/api/admin/documents/${doc.id}/file`)).status).toBe(200);

    const verified = await admin.post(`/api/admin/helpers/${sunitaId}/verification`, { status: "verified" });
    expect(verified.body.verification).toBe("verified");

    expect(await notificationTitles(sunita)).toContain("You're verified! Residents can now book you.");
  });

  it("queues a verified helper's profile edits for admin approval", async () => {
    const edit = await sunita.patch("/api/worker/profile", { ratePerVisit: 450, summary: "Also babysitting" });
    expect(edit.body.queued).toBe(true);
    const more = await sunita.patch("/api/worker/profile", { categories: ["Housekeeping", "Cooking", "Babysitting"] });
    expect(more.body.queued).toBe(true);
    expect((await meera.get("/api/helpers/sunita-devi")).body.ratePerVisit).toBe(400); // not live yet

    const [change] = (await admin.get("/api/admin/profile-changes")).body;
    expect(change.changes).toMatchObject({ ratePerVisit: 450, categories: ["Housekeeping", "Cooking", "Babysitting"] });
    expect((await admin.get("/api/admin/stats")).body.pendingProfileChanges).toBe(1);

    // Rejected: nothing changes, and the helper sees why.
    await admin.post(`/api/admin/profile-changes/${change.id}`, { status: "rejected", note: "Rate too high for the block" });
    const latest = (await sunita.get("/api/worker/profile")).body.latestChange;
    expect(latest).toMatchObject({ status: "rejected", note: "Rate too high for the block" });

    // Approved: goes live.
    await sunita.patch("/api/worker/profile", { summary: "Chapatis, event food and babysitting" });
    const [next] = (await admin.get("/api/admin/profile-changes")).body;
    await admin.post(`/api/admin/profile-changes/${next.id}`, { status: "approved" });
    const live = (await meera.get("/api/helpers/sunita-devi")).body;
    expect(live).toMatchObject({ summary: "Chapatis, event food and babysitting", ratePerVisit: 400 });

    // Availability isn't reviewed.
    expect((await sunita.put("/api/worker/availability", { isAccepting: true })).body.isAccepting).toBe(true);
  });

  it("lets residents search and open a helper profile", async () => {
    const all = await meera.get("/api/helpers");
    expect(all.body).toHaveLength(1);
    expect(all.body[0]).toMatchObject({ name: "Sunita Devi", status: "available", ratePerVisit: 400, rating: 0, area: "Tower A" });

    expect((await meera.get("/api/helpers?service=chapati")).body).toHaveLength(1);
    expect((await meera.get("/api/helpers?category=Cooking")).body).toHaveLength(1);
    expect((await meera.get("/api/helpers?category=Driving")).body).toHaveLength(0);
    expect((await meera.get("/api/helpers?q=plumber")).body).toHaveLength(0);

    const profile = await meera.get("/api/helpers/sunita-devi");
    expect(profile.body.services).toHaveLength(2);
    expect(profile.body.photoUrl).toMatch(/^\/uploads\/photos\//);
  });

  it("prices a weekly plan", async () => {
    // Tue 6 Oct → Mon 12 Oct on weekdays = 5 visits
    const quote = await meera.post("/api/bookings/quote", {
      helperId: sunitaId, plan: "weekly", startDate: "2026-10-06", startTime: "08:00", endTime: "10:30",
      serviceIds: [chapatiServiceId, eventServiceId],
    });
    expect(quote.body).toMatchObject({ visits: 5, base: 2000, fee: 49, total: 2000 + 900 + 1200 + 49 });

    const past = await meera.post("/api/bookings/quote", {
      helperId: sunitaId, plan: "weekly", startDate: "2026-10-01", startTime: "08:00", endTime: "10:30",
    });
    expect(past.status).toBe(400);
  });

  it("runs the booking request → accept flow and prevents double-booking", async () => {
    const slot = { helperId: sunitaId, plan: "weekly", startDate: "2026-10-06", startTime: "08:00", endTime: "10:30" };
    expect((await sunita.post("/api/bookings", slot)).status).toBe(403);

    const mine = await meera.post("/api/bookings", { ...slot, serviceIds: [chapatiServiceId] });
    expect(mine.status).toBe(201);
    expect(mine.body).toMatchObject({ status: "pending", flat: "Tower A · A-402", total: 2000 + 900 + 49, cancellable: true });
    bookingId = mine.body.id;

    const other = await ravi.post("/api/bookings", { ...slot, startTime: "09:00", endTime: "11:00" });
    expect(other.status).toBe(201);

    const requests = await sunita.get("/api/bookings?status=pending");
    expect(requests.body).toHaveLength(2);

    const accepted = await sunita.post(`/api/bookings/${bookingId}/accept`);
    expect(accepted.body.status).toBe("confirmed");
    expect((await sunita.post(`/api/bookings/${other.body.id}/accept`)).status).toBe(409); // overlaps

    expect((await ravi.post(`/api/bookings/${other.body.id}/cancel`, { reason: "Found someone" })).body.status).toBe("cancelled");
    expect(await notificationTitles(meera)).toContain("Booking confirmed");
    expect((await ravi.get(`/api/bookings/${bookingId}`)).status).toBe(404); // not ravi's booking

    const profile = await meera.get("/api/helpers/sunita-devi");
    expect(profile.body.houses).toEqual([{ flat: "Tower A · A-402", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "08:00", endTime: "10:30" }]);
    expect((await meera.get("/api/helpers?day=Tue&time=09:00")).body).toHaveLength(0); // busy then
    expect((await meera.get("/api/helpers?day=Tue&time=11:00")).body).toHaveLength(1);
  });

  it("allows free cancellation only until 24h before the start", async () => {
    // Now is exactly 24h before Tue 08:00
    expect((await meera.get(`/api/bookings/${bookingId}`)).body.cancellable).toBe(true);
    setNow("2026-10-05T09:00:00+05:30");
    expect((await meera.get(`/api/bookings/${bookingId}`)).body.cancellable).toBe(false);
    expect((await meera.post(`/api/bookings/${bookingId}/cancel`)).status).toBe(409);
  });

  it("checks the helper in and out with the resident's door code", async () => {
    setNow("2026-10-06T08:05:00+05:30"); // Tuesday, first visit

    const residentView = await meera.get("/api/visits/today");
    expect(residentView.body).toHaveLength(1);
    const code = residentView.body[0].doorCode;
    expect(code).toMatch(/^\d{4}$/);

    const helperView = await sunita.get("/api/visits/today");
    expect(helperView.body[0].doorCode).toBeUndefined();
    expect(helperView.body[0].state).toBe("awaiting");

    const wrongCode = code === "0000" ? "1111" : "0000";
    const wrong = await sunita.post("/api/visits/check-in", { bookingId, code: wrongCode });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.attemptsLeft).toBe(4);

    expect((await sunita.post("/api/visits/check-out", { bookingId, code })).status).toBe(409);
    expect((await sunita.post("/api/visits/check-in", { bookingId, code })).body.state).toBe("inside");
    expect((await sunita.post("/api/visits/check-in", { bookingId, code })).status).toBe(409);
    expect(await notificationTitles(meera)).toContain("Sunita Devi has arrived");

    setNow("2026-10-06T10:31:00+05:30");
    const out = await sunita.post("/api/visits/check-out", { bookingId, code });
    expect(out.body.state).toBe("done");
  });

  it("locks the door code after too many wrong tries until the resident issues a new one", async () => {
    setNow("2026-10-08T08:00:00+05:30"); // Thursday (Wednesday was missed)
    const [visit] = (await meera.get("/api/visits/today")).body;
    const wrongCode = visit.doorCode === "0000" ? "1111" : "0000";

    for (let i = 0; i < config.maxDoorCodeAttempts; i++) {
      await sunita.post("/api/visits/check-in", { bookingId, code: wrongCode });
    }
    expect((await sunita.post("/api/visits/check-in", { bookingId, code: visit.doorCode })).status).toBe(423);

    const fresh = await meera.post("/api/visits/new-code", { bookingId });
    expect((await sunita.post("/api/visits/check-in", { bookingId, code: fresh.body.doorCode })).status).toBe(200);
    setNow("2026-10-08T10:30:00+05:30");
    expect((await sunita.post("/api/visits/check-out", { bookingId, code: fresh.body.doorCode })).status).toBe(200);
  });

  it("records leave and shows it to residents", async () => {
    expect((await sunita.post("/api/worker/leaves", { startDate: "2026-10-09", endDate: "2026-10-09", reason: "Family function" })).status).toBe(201);
    expect(await notificationTitles(meera)).toContain("Sunita Devi is on leave");

    setNow("2026-10-09T09:00:00+05:30");
    expect((await meera.get("/api/helpers")).body[0].status).toBe("leave");
  });

  it("builds the attendance calendar from real check-ins", async () => {
    setNow("2026-10-10T09:00:00+05:30");
    const res = await meera.get(`/api/helpers/${sunitaId}/attendance?month=2026-10`);
    const state = (date: string) => res.body.days.find((d: any) => d.date === date).state;

    expect(state("2026-10-05")).toBe("none"); // before the booking
    expect(state("2026-10-06")).toBe("present");
    expect(state("2026-10-07")).toBe("absent"); // booked, never checked in
    expect(state("2026-10-08")).toBe("present");
    expect(state("2026-10-09")).toBe("leave");
    expect(res.body.totals).toEqual({ present: 2, absent: 1, leave: 1 });

    const schedule = (await meera.get(`/api/bookings/${bookingId}`)).body.schedule;
    expect(schedule.map((d: any) => d.state)).toEqual(["done", "missed", "done", "missed", "upcoming"]);
  });

  it("collects reviews and updates the rating", async () => {
    const review = await meera.post(`/api/bookings/${bookingId}/review`, { stars: 5, comment: "Punctual and kind." });
    expect(review.status).toBe(201);
    expect((await meera.post(`/api/bookings/${bookingId}/review`, { stars: 4 })).status).toBe(409);

    const profile = await ravi.get("/api/helpers/sunita-devi");
    expect(profile.body).toMatchObject({ rating: 5, reviewCount: 1 });
    expect(profile.body.reviews[0]).toMatchObject({ stars: 5, residentName: "User meera", flat: "Tower A · A-402" });
    expect(profile.body.hoursLast30Days).toBeGreaterThan(0);
  });

  it("calculates helper earnings from completed visits", async () => {
    const res = await sunita.get("/api/worker/earnings?from=2026-10-01&to=2026-10-31");
    expect(res.body).toMatchObject({ totalVisits: 2, totalAmount: 2 * (400 + 180) });
  });

  it("handles complaints end to end", async () => {
    const complaint = await ravi.post("/api/complaints", {
      subject: "Late arrival", description: "Helper arrived an hour late twice.", helperId: sunitaId,
    });
    expect(complaint.status).toBe(201);
    expect((await admin.get("/api/admin/stats")).body.openComplaints).toBe(1);

    const resolved = await admin.patch(`/api/admin/complaints/${complaint.body.id}`, { status: "resolved", resolution: "Spoke to the helper." });
    expect(resolved.body.status).toBe("resolved");
    expect(await notificationTitles(ravi)).toContain("Your complaint was resolved");
  });

  it("gives admins a daily attendance view", async () => {
    const res = await admin.get("/api/admin/attendance?date=2026-10-06");
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ flat: "Tower A · A-402", state: "done", helper: { name: "Sunita Devi" } });
  });

  it("completes finished plans and expires unanswered requests", async () => {
    const late = await meera.post("/api/bookings", {
      helperId: sunitaId, plan: "one_time", startDate: "2026-10-14", startTime: "15:00", endTime: "17:00",
    });
    expect(late.status).toBe(201);

    setNow("2026-10-15T09:00:00+05:30");
    const bookings = (await meera.get("/api/bookings")).body;
    expect(bookings.find((b: any) => b.id === bookingId).status).toBe("completed");
    expect(bookings.find((b: any) => b.id === late.body.id)).toMatchObject({ status: "rejected", cancelReason: "Request expired" });
  });

  it("blocks deactivated accounts immediately", async () => {
    expect((await admin.patch(`/api/admin/users/${raviUserId}`, { isActive: false })).body.isActive).toBe(false);
    expect((await ravi.get("/api/auth/me")).status).toBe(401);
    const login = await request(app).post("/api/auth/login").send({ login: "ravi", password: "correct-horse-1" });
    expect(login.status).toBe(401);
  });
});
