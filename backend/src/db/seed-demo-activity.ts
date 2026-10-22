import { config } from "../config.js";
import { addDays, today, weekdayOf } from "../lib/dates.js";
import { planEndDate, visitDates, type Plan } from "../lib/pricing.js";
import { newDoorCode } from "../services/bookings.js";
import { connect, type Db } from "./db.js";

/**
 * Fills the demo accounts from seed-demo.ts with a few weeks of activity: finished plans with
 * attendance and reviews, running plans (today's visits wait with a door code), upcoming, pending,
 * rejected and cancelled requests, leaves, complaints, a pending profile change and notifications.
 *   npx tsx --env-file=.env src/db/seed-demo-activity.ts           add it (once)
 *   npx tsx --env-file=.env src/db/seed-demo-activity.ts remove    delete it, keeping the accounts
 * Run again after a migration adds booking categories to fill them in.
 */
const DOMAIN = "helphive-demo.example";
const TZ = config.timezone;

// Index into seed-demo.ts: helpers 0 Sunita, 1 Lakshmi, 2 Rekha, 3 Manoj, 4 Priya, 5 Asha, 6 Ganesh,
// 7 Kavita, 8 Ramesh, 9 Neha; residents 0 Rohan, 1 Sneha, 2 Amit, 3 Pooja, 4 Vikram, 5 Anjali,
// 6 Siddharth, 7 Meera, 8 Arjun, 9 Divya.
const HELPERS = ["sunitadevi", "lakshmiiyer", "rekhapawar", "manojkumar", "priyashinde", "ashagaikwad", "ganeshmore", "kavitajadhav", "rameshyadav", "nehakulkarni"];
const RESIDENTS = ["rohandeshmukh", "snehajoshi", "amitsharma", "poojanair", "vikrampatil", "anjalimehta", "siddharthrao", "meerakapoor", "arjunbhosale", "divyamenon"];

type Spec = {
  h: number;
  r: number;
  plan: Plan;
  start: number; // days from today
  days?: string[]; // defaults to the helper's working days that fall Mon–Fri
  time: [string, string];
  status: "completed" | "confirmed" | "pending" | "rejected" | "cancelled";
  extras?: boolean; // add the helper's extra services
  missEvery?: number; // skip every nth past visit (shows as absent)
  reason?: string;
  review?: [number, string];
  notes?: string;
};

const MWF = ["Mon", "Wed", "Fri"];
const ALL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON_SAT = ALL.slice(0, 6);

const SPECS: Spec[] = [
  // Finished plans
  { h: 0, r: 0, plan: "monthly", start: -50, time: ["07:00", "09:00"], status: "completed", missEvery: 9, review: [5, "Food tastes just like home and she is always on time."] },
  { h: 1, r: 3, plan: "weekly", start: -30, days: MON_SAT, time: ["07:00", "09:00"], status: "completed", review: [4, "Lovely dosas and idlis. Came a little late once."] },
  { h: 2, r: 5, plan: "monthly", start: -40, days: MWF, time: ["09:00", "11:00"], status: "completed", missEvery: 7, review: [5, "Spotless every time, very trustworthy."] },
  { h: 6, r: 6, plan: "monthly", start: -45, days: MON_SAT, time: ["06:30", "07:30"], status: "completed", extras: true, missEvery: 8, review: [4, "Car shines every morning. Missed a couple of days."] },
  { h: 9, r: 8, plan: "one_time", start: -12, time: ["10:00", "18:00"], status: "completed", extras: true, review: [5, "Our dog loved her! Sent us photos all day."] },
  { h: 4, r: 1, plan: "weekly", start: -25, time: ["09:00", "14:00"], status: "completed", review: [5, "Kids adore Priya. Very patient and caring."] },
  { h: 8, r: 9, plan: "monthly", start: -35, days: ["Sat", "Sun"], time: ["07:00", "09:00"], status: "completed", review: [4, "Balcony garden looks great now."] },
  { h: 5, r: 7, plan: "weekly", start: -20, days: ALL, time: ["08:00", "12:00"], status: "completed", extras: true, review: [5, "Took wonderful care of my mother after her surgery."] },
  // Running now
  { h: 0, r: 1, plan: "monthly", start: -12, days: MON_SAT, time: ["09:30", "11:30"], status: "confirmed", extras: true, missEvery: 10, notes: "Less oil please, and no onion on Tuesdays." },
  { h: 1, r: 4, plan: "monthly", start: -10, time: ["07:00", "09:00"], status: "confirmed" },
  { h: 2, r: 6, plan: "monthly", start: -8, days: ALL, time: ["10:00", "12:00"], status: "confirmed", missEvery: 6 },
  { h: 3, r: 2, plan: "weekly", start: -3, days: MON_SAT, time: ["10:00", "13:00"], status: "confirmed" },
  { h: 4, r: 9, plan: "monthly", start: -15, time: ["15:00", "19:00"], status: "confirmed", notes: "Pick up from school bus stop at 3." },
  { h: 5, r: 0, plan: "monthly", start: -14, days: ALL, time: ["13:00", "17:00"], status: "confirmed" },
  { h: 7, r: 8, plan: "monthly", start: -9, days: MWF, time: ["11:00", "13:00"], status: "confirmed", extras: true },
  { h: 9, r: 3, plan: "monthly", start: -11, days: ALL, time: ["07:00", "08:00"], status: "confirmed" },
  { h: 6, r: 7, plan: "monthly", start: -5, time: ["08:00", "09:30"], status: "confirmed", missEvery: 4 },
  // Upcoming
  { h: 1, r: 5, plan: "one_time", start: 4, time: ["10:00", "12:00"], status: "confirmed", extras: true, notes: "Birthday lunch for 12 people." },
  { h: 8, r: 2, plan: "monthly", start: 3, days: ["Sat", "Sun"], time: ["08:00", "10:00"], status: "confirmed" },
  // Waiting for the helper to answer
  { h: 0, r: 2, plan: "one_time", start: 2, time: ["12:00", "13:30"], status: "pending" },
  { h: 3, r: 5, plan: "one_time", start: 5, time: ["10:00", "14:00"], status: "pending", extras: true, notes: "3BHK before Diwali." },
  { h: 4, r: 6, plan: "weekly", start: 5, time: ["09:00", "12:00"], status: "pending" },
  { h: 7, r: 0, plan: "monthly", start: 4, days: ["Tue", "Thu"], time: ["14:00", "16:00"], status: "pending" },
  { h: 9, r: 4, plan: "weekly", start: 2, days: ALL, time: ["18:00", "19:00"], status: "pending" },
  // Didn't happen
  { h: 2, r: 7, plan: "one_time", start: 6, time: ["13:00", "15:00"], status: "rejected", reason: "Already booked that afternoon, sorry!" },
  { h: 6, r: 1, plan: "weekly", start: 8, time: ["07:00", "08:00"], status: "cancelled", reason: "Found someone in our tower" },
  { h: 5, r: 9, plan: "one_time", start: -3, time: ["09:00", "11:00"], status: "rejected", reason: "Request expired" },
];

const LEAVES = [
  { h: 5, start: -6, end: -5, reason: "Family function" },
  { h: 0, start: 7, end: 8, reason: "Going to my village" },
  { h: 2, start: 10, end: 10, reason: "Doctor's appointment" },
];

const COMPLAINTS = [
  { by: "r", who: 4, h: 1, booking: 9, subject: "Helper late twice this week", description: "Lakshmi came about 30 minutes late on Monday and Wednesday, so breakfast was not ready before office.", status: "open" },
  { by: "r", who: 6, h: 6, booking: 3, subject: "Car not cleaned properly", description: "The rear windows and mats were left dirty on Saturday even though the visit was marked done.", status: "resolved", resolution: "Spoke to Ganesh; he redid the cleaning at no charge." },
  { by: "h", who: 7, h: null, booking: 14, subject: "Kept waiting at the door", description: "Nobody answered for 20 minutes on Friday and the door code was not shared in time.", status: "dismissed", resolution: "Resident was travelling; the visit was rescheduled." },
] as const;

const at = (date: string, time: string, minutes = 0) => [date, time, minutes] as const;
const stamp = `(($1::date + $2::time) AT TIME ZONE '${TZ}') + make_interval(mins => $3)`;

async function idsOf(db: Db, names: string[]) {
  const rows = await db.query<{ id: string; username: string }>(
    "SELECT id, username FROM users WHERE username = ANY($1)",
    [names.map((n) => `demo.${n}`)],
  );
  const byName = new Map(rows.map((r) => [r.username, r.id]));
  return names.map((n) => {
    const id = byName.get(`demo.${n}`);
    if (!id) throw new Error(`Demo account demo.${n} is missing; run seed-demo.ts first`);
    return id;
  });
}

async function hasColumn(db: Db, table: string, column: string) {
  const [row] = await db.query<{ ok: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2) AS ok",
    [table, column],
  );
  return row.ok;
}

async function remove(db: Db) {
  const demo = `(SELECT id FROM users WHERE email LIKE '%@${DOMAIN}')`;
  await db.query(`DELETE FROM complaints WHERE raised_by IN ${demo} OR helper_id IN ${demo}`);
  // Admins' notifications about demo complaints and the demo profile change go too.
  await db.query(
    `DELETE FROM notifications WHERE user_id IN ${demo} OR body = ANY($1)`,
    [[...COMPLAINTS.map((c) => c.subject), "Manoj Kumar edited their profile"]],
  );
  const bookings = await db.query(`DELETE FROM bookings WHERE resident_id IN ${demo} OR helper_id IN ${demo} RETURNING id`);
  await db.query(`DELETE FROM helper_leaves WHERE helper_id IN ${demo}`);
  await db.query(`DELETE FROM profile_changes WHERE helper_id IN ${demo}`);
  console.log(`Removed demo activity (${bookings.length} bookings)`);
}

async function seed(db: Db) {
  const T = today();
  const helperIds = await idsOf(db, HELPERS);
  const residentIds = await idsOf(db, RESIDENTS);
  const hasCategories = await hasColumn(db, "bookings", "categories");
  const hasRates = await hasColumn(db, "helpers", "category_rates");

  // One query at a time: a transaction runs on a single connection.
  const helpers: any[] = [];
  for (const id of helperIds) {
    const [h] = await db.query(
      `SELECT u.name, h.categories, h.rate_per_visit AS rate, h.work_days AS "workDays"
              ${hasRates ? ", h.category_rates AS rates" : ""}
       FROM helpers h JOIN users u ON u.id = h.user_id WHERE h.user_id = $1`,
      [id],
    );
    const services = await db.query("SELECT id, label, price, unit FROM helper_services WHERE helper_id = $1", [id]);
    helpers.push({ id, ...h, services });
  }
  const residents: any[] = [];
  for (const id of residentIds) {
    const [r] = await db.query("SELECT name, concat_ws(' · ', building, nullif(place, '')) AS flat FROM users WHERE id = $1", [id]);
    residents.push({ id, ...r });
  }

  const note = (userId: string, title: string, body: string, link: string, date: string, time: string) =>
    db.query(
      `INSERT INTO notifications (user_id, title, body, link, created_at, read_at)
       VALUES ($4, $5, $6, $7, ${stamp}, CASE WHEN $1::date < $8::date - 1 THEN ${stamp} END)`,
      [date, time, 0, userId, title, body, link, T],
    );

  const bookingIds: string[] = [];
  for (const s of SPECS) {
    const helper = helpers[s.h];
    const resident = residents[s.r];

    // One-time visits move forward to the helper's next working day.
    let startDate = addDays(T, s.start);
    if (s.plan === "one_time") while (!helper.workDays.includes(weekdayOf(startDate))) startDate = addDays(startDate, 1);
    const endDate = planEndDate(s.plan, startDate);
    const days = s.plan === "one_time"
      ? [weekdayOf(startDate)]
      : (s.days ?? ["Mon", "Tue", "Wed", "Thu", "Fri"]).filter((d) => helper.workDays.includes(d));
    const dates = visitDates(startDate, endDate, days);

    const category = helper.categories[0];
    const rate = hasRates ? (helper.rates?.[category] ?? helper.rate) : helper.rate;
    const extras = (s.extras ? helper.services : []).map((e: any) => ({
      ...e,
      amount: e.unit === "visit" ? e.price * dates.length : e.price,
    }));
    const total = dates.length * rate + extras.reduce((sum: number, e: any) => sum + e.amount, 0) + config.convenienceFee;
    const createdOn = s.status === "pending" ? addDays(T, -1) : addDays(startDate, -3);

    const [{ id }] = await db.query<{ id: string }>(
      `INSERT INTO bookings (resident_id, helper_id, flat, plan, start_date, end_date, days, start_time, end_time,
                             visits, rate_per_visit, extras, total, status, notes, cancel_reason, created_at)
       VALUES ($4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, ${stamp}) RETURNING id`,
      [createdOn, "20:00", 0, resident.id, helper.id, resident.flat, s.plan, startDate, endDate, days, s.time[0], s.time[1],
        dates.length, rate, JSON.stringify(extras), total, s.status, s.notes ?? "", s.reason ?? null],
    );
    if (hasCategories) await db.query("UPDATE bookings SET categories = $2 WHERE id = $1", [id, [category]]);
    bookingIds.push(id);

    const plan = s.plan.replace("_", "-");
    await note(helper.id, "New house request", `${resident.flat} · ${plan} plan`, "/worker/requests", createdOn, "20:00");
    if (s.status === "rejected") {
      await note(resident.id, "Booking declined", s.reason!, "/bookings", addDays(createdOn, 1), "09:00");
    } else if (s.status === "cancelled") {
      await note(helper.id, "Booking cancelled", `${resident.name} (${resident.flat}) cancelled`, "/worker", addDays(createdOn, 1), "18:00");
    } else if (s.status !== "pending") {
      await note(resident.id, "Booking confirmed", `${helper.name} accepted your booking`, "/bookings", addDays(createdOn, 1), "08:30");
    }
    if (s.status !== "completed" && s.status !== "confirmed") continue;

    // Past visits: checked in and out around the booked times, with the odd missed day.
    const onLeave = (date: string) =>
      LEAVES.some((l) => l.h === s.h && addDays(T, l.start) <= date && date <= addDays(T, l.end));
    const past = dates.filter((d) => d < T && !onLeave(d));
    for (const [n, date] of past.entries()) {
      if (s.missEvery && (n + 1) % s.missEvery === 0) continue;
      const jitter = (n * 7) % 11;
      await db.query(
        `INSERT INTO visits (booking_id, visit_date, door_code, check_in_at, check_out_at)
         VALUES ($4, $1, $5, ${stamp}, (($1::date + $6::time) AT TIME ZONE '${TZ}') - make_interval(mins => $3))`,
        [date, s.time[0], jitter, id, newDoorCode(), s.time[1]],
      );
    }
    const last = past.at(-1);
    if (last && s.status === "confirmed") {
      await note(resident.id, `${helper.name} has arrived`, `${resident.flat} · a new code is ready for when they leave`, "/dashboard", last, s.time[0]);
      await note(resident.id, `${helper.name} has left`, resident.flat, "/dashboard", last, s.time[1]);
    }
    if (s.review) {
      const reviewDay = addDays(endDate, 1) < T ? addDays(endDate, 1) : addDays(T, -1);
      await db.query(
        `INSERT INTO reviews (booking_id, helper_id, resident_id, stars, comment, created_at)
         VALUES ($4, $5, $6, $7, $8, ${stamp})`,
        [reviewDay, "19:00", 0, id, helper.id, resident.id, s.review[0], s.review[1]],
      );
      await note(helper.id, "New review", `${s.review[0]}★ from ${resident.name}`, "/worker/profile", reviewDay, "19:00");
    }
  }

  for (const l of LEAVES) {
    const startDate = addDays(T, l.start);
    const endDate = addDays(T, l.end);
    await db.query(
      `INSERT INTO helper_leaves (helper_id, start_date, end_date, reason, created_at) VALUES ($4, $5, $6, $7, ${stamp})`,
      [addDays(T, Math.min(l.start - 3, -1)), "21:00", 0, helpers[l.h].id, startDate, endDate, l.reason],
    );
    if (l.start > 0) {
      for (const [n, s] of SPECS.entries()) {
        const b = bookingIds[n];
        if (s.h !== l.h || s.status !== "confirmed" || !b) continue;
        await note(residents[s.r].id, `${helpers[l.h].name} is on leave`, `${startDate} to ${endDate}`, "/schedule", addDays(T, -1), "21:00");
      }
    }
  }

  const admins = await db.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND is_active");
  for (const [n, c] of COMPLAINTS.entries()) {
    const raisedBy = c.by === "r" ? residents[c.who].id : helpers[c.who].id;
    const raisedOn = addDays(T, -4 + n);
    await db.query(
      `INSERT INTO complaints (raised_by, helper_id, booking_id, subject, description, status, resolution, created_at, updated_at)
       VALUES ($4, $5, $6, $7, $8, $9, $10, ${stamp}, ${stamp} + interval '1 day')`,
      [raisedOn, "18:30", 0, raisedBy, c.h === null ? null : helpers[c.h].id, bookingIds[c.booking], c.subject, c.description,
        c.status, "resolution" in c ? c.resolution : null],
    );
    for (const admin of admins) await note(admin.id, "New complaint", c.subject, "/admin?tab=complaints", raisedOn, "18:30");
    if (c.status !== "open") {
      await note(raisedBy, `Your complaint was ${c.status}`, "resolution" in c ? c.resolution : "", "/complaints", addDays(raisedOn, 1), "18:30");
    }
  }

  // A profile edit waiting for the admin to approve.
  await db.query("INSERT INTO profile_changes (helper_id, changes) VALUES ($1, $2::jsonb)", [
    helpers[3].id,
    JSON.stringify({ summary: "Deep cleaning specialist: kitchens, bathrooms and full-home move-in cleans.", ratePerVisit: 450 }),
  ]);
  for (const admin of admins) {
    await note(admin.id, "Profile change to review", `${helpers[3].name} edited their profile`, "/admin?tab=changes", addDays(T, -1), "16:00");
  }

  console.log(`Added ${SPECS.length} bookings with visits, reviews, ${LEAVES.length} leaves, ${COMPLAINTS.length} complaints and a profile change`);
}

/** After migration 005 adds bookings.categories, give demo bookings their helper's first service. */
async function fillCategories(db: Db) {
  if (!(await hasColumn(db, "bookings", "categories"))) return;
  const filled = await db.query(
    `UPDATE bookings b SET categories = ARRAY[h.categories[1]]
     FROM helpers h, users u
     WHERE h.user_id = b.helper_id AND u.id = b.resident_id AND u.email LIKE '%@${DOMAIN}' AND b.categories = '{}'
     RETURNING b.id`,
  );
  if (filled.length) console.log(`Filled categories on ${filled.length} demo bookings`);
}

const db = await connect();
try {
  if (process.argv[2] === "remove") {
    await db.transaction(remove);
  } else {
    const [existing] = await db.query(
      `SELECT 1 FROM bookings b JOIN users u ON u.id = b.resident_id WHERE u.email LIKE '%@${DOMAIN}' LIMIT 1`,
    );
    if (existing) console.log("Demo activity already exists; run with 'remove' first to recreate it");
    else await db.transaction(seed);
    await fillCategories(db);
  }
} finally {
  await db.close();
}
