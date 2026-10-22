import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hashPassword } from "../lib/auth.js";
import { connect } from "./db.js";

/**
 * Adds 10 verified demo helpers and 10 residents for presentations, all sharing one password.
 *   npx tsx --env-file=.env src/db/seed-demo.ts           add them (skips ones that exist)
 *   npx tsx --env-file=.env src/db/seed-demo.ts remove    delete them again
 * Logins are written to .data/demo-helpers.txt (git-ignored).
 */
const DOMAIN = "helphive-demo.example";

type Demo = {
  name: string;
  building: string;
  categories: string[];
  rate: number;
  summary: string;
  workDays: string[];
  hours: [string, string];
  extras: { label: string; price: number; unit: "visit" | "event" }[];
};

const MON_SAT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_WEEK = [...MON_SAT, "Sun"];

const DEMOS: Demo[] = [
  { name: "Sunita Devi", building: "tower A", categories: ["Housekeeping", "Cooking"], rate: 250, summary: "10 years cooking North Indian meals and running households.", workDays: MON_SAT, hours: ["07:00", "14:00"], extras: [{ label: "Daily chapatis", price: 60, unit: "visit" }] },
  { name: "Lakshmi Iyer", building: "tower B", categories: ["Cooking"], rate: 300, summary: "South Indian home cook; tiffin and lunch boxes.", workDays: MON_SAT, hours: ["06:30", "12:30"], extras: [{ label: "Party cooking (up to 15 guests)", price: 1500, unit: "event" }] },
  { name: "Rekha Pawar", building: "tower C", categories: ["Cleaning", "Dishwashing"], rate: 150, summary: "Quick, thorough daily cleaning and dishes.", workDays: ALL_WEEK, hours: ["08:00", "16:00"], extras: [] },
  { name: "Manoj Kumar", building: "tower D", categories: ["Deep cleaning", "Cleaning"], rate: 400, summary: "Kitchen and bathroom deep cleaning with my own supplies.", workDays: MON_SAT, hours: ["09:00", "18:00"], extras: [{ label: "Sofa shampoo", price: 800, unit: "event" }] },
  { name: "Priya Shinde", building: "tower A", categories: ["Babysitting"], rate: 350, summary: "Trained nanny, first-aid certified, great with toddlers.", workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], hours: ["09:00", "19:00"], extras: [] },
  { name: "Asha Gaikwad", building: "tower B", categories: ["Elderly care", "Patient care"], rate: 500, summary: "Experienced caregiver for seniors and post-surgery patients.", workDays: ALL_WEEK, hours: ["08:00", "20:00"], extras: [{ label: "Overnight stay", price: 1200, unit: "event" }] },
  { name: "Ganesh More", building: "tower C", categories: ["Car washing", "Driving"], rate: 200, summary: "Morning car wash; licensed driver for school and office runs.", workDays: MON_SAT, hours: ["06:00", "12:00"], extras: [{ label: "Interior vacuum", price: 150, unit: "visit" }] },
  { name: "Kavita Jadhav", building: "tower D", categories: ["Laundry & ironing", "Housekeeping"], rate: 180, summary: "Washing, folding and crisp ironing, same day.", workDays: MON_SAT, hours: ["10:00", "17:00"], extras: [{ label: "Dry-clean pickup", price: 100, unit: "visit" }] },
  { name: "Ramesh Yadav", building: "tower A", categories: ["Gardening"], rate: 220, summary: "Balcony and terrace gardens, potting and plant care.", workDays: ["Sat", "Sun"], hours: ["07:00", "13:00"], extras: [] },
  { name: "Neha Kulkarni", building: "tower B", categories: ["Pet care"], rate: 200, summary: "Dog walking, feeding and pet sitting while you travel.", workDays: ALL_WEEK, hours: ["06:00", "21:00"], extras: [{ label: "Pet sitting (full day)", price: 900, unit: "event" }] },
];

// Flats fall inside each tower's numbering (tower A 101–120, B 201–220, …).
const RESIDENTS: { name: string; building: string; flat: string }[] = [
  { name: "Rohan Deshmukh", building: "tower A", flat: "104" },
  { name: "Sneha Joshi", building: "tower A", flat: "112" },
  { name: "Amit Sharma", building: "tower B", flat: "203" },
  { name: "Pooja Nair", building: "tower B", flat: "215" },
  { name: "Vikram Patil", building: "tower C", flat: "301" },
  { name: "Anjali Mehta", building: "tower C", flat: "309" },
  { name: "Siddharth Rao", building: "tower C", flat: "318" },
  { name: "Meera Kapoor", building: "tower D", flat: "402" },
  { name: "Arjun Bhosale", building: "tower D", flat: "407" },
  { name: "Divya Menon", building: "tower D", flat: "419" },
];

const LOGINS_FILE = ".data/demo-helpers.txt";

const slugOf =(name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const usernameOf = (name: string) => `demo.${slugOf(name).replace(/-/g, "")}`;

const db = await connect();
try {
  if (process.argv[2] === "remove") {
    // Their bookings and complaints block deleting the accounts (see seed-demo-activity.ts remove).
    const demo = `(SELECT id FROM users WHERE email LIKE '%@${DOMAIN}')`;
    await db.query(`DELETE FROM complaints WHERE raised_by IN ${demo} OR helper_id IN ${demo}`);
    await db.query(`DELETE FROM bookings WHERE resident_id IN ${demo} OR helper_id IN ${demo}`);
    const removed =await db.query(`DELETE FROM users WHERE email LIKE $1 RETURNING username`, [`%@${DOMAIN}`]);
    console.log(`Removed ${removed.length} demo accounts`);
  } else {
    // Keep the password from an earlier run so existing demo logins still work.
    const previous = existsSync(LOGINS_FILE) ? readFileSync(LOGINS_FILE, "utf8").match(/^Password for all: (\S+)$/m)?.[1] : undefined;
    const password = previous ?? `Hive-${randomBytes(4).toString("hex")}`;
    const passwordHash = await hashPassword(password);
    const [{ has_rates }] = await db.query<{ has_rates: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'helpers' AND column_name = 'category_rates') AS has_rates`,
    );

    const created: string[] = [];
    for (const [i, d] of DEMOS.entries()) {
      const username = usernameOf(d.name);
      const [exists] = await db.query("SELECT 1 FROM users WHERE lower(username) = $1", [username]);
      if (exists) continue;
      await db.transaction(async (tx) => {
        const [{ id }] = await tx.query<{ id: string }>(
          `INSERT INTO users (role, name, username, email, phone, building, place, password_hash)
           VALUES ('worker', $1, $2, $3, $4, $5, $5, $6) RETURNING id`,
          [d.name, username, `${username}@${DOMAIN}`, `90000000${String(i + 1).padStart(2, "0")}`, d.building, passwordHash],
        );
        await tx.query(
          `INSERT INTO helpers (user_id, slug, summary, rate_per_visit, categories, verification, verified_at,
                                onboarded_at, work_days, work_start, work_end)
           VALUES ($1, $2, $3, $4, $5, 'verified', now(), now(), $6, $7, $8)`,
          [id, slugOf(d.name), d.summary, d.rate, d.categories, d.workDays, d.hours[0], d.hours[1]],
        );
        if (has_rates) {
          // Second service a little dearer, so the per-service pricing shows.
          const rates = Object.fromEntries(d.categories.map((c, n) => [c, d.rate + n * 50]));
          await tx.query("UPDATE helpers SET category_rates = $2 WHERE user_id = $1", [id, JSON.stringify(rates)]);
        }
        for (const e of d.extras) {
          await tx.query("INSERT INTO helper_services (helper_id, label, price, unit) VALUES ($1, $2, $3, $4)", [
            id, e.label, e.price, e.unit,
          ]);
        }
      });
      created.push(username);
    }

    for (const [i, r] of RESIDENTS.entries()) {
      const username = usernameOf(r.name);
      const [exists] = await db.query("SELECT 1 FROM users WHERE lower(username) = $1", [username]);
      if (exists) continue;
      await db.query(
        `INSERT INTO users (role, name, username, email, phone, building, place, password_hash)
         VALUES ('resident', $1, $2, $3, $4, $5, $6, $7)`,
        [r.name, username, `${username}@${DOMAIN}`, `90000001${String(i + 1).padStart(2, "0")}`, r.building, r.flat, passwordHash],
      );
      created.push(username);
    }

    mkdirSync(".data", { recursive: true });
    const list = (title: string, rows: string[]) => `${title}\n${rows.join("\n")}\n`;
    writeFileSync(
      LOGINS_FILE,
      `HelpHive demo accounts (log in with the username)\nPassword for all: ${password}\n\n` +
        list("Helpers", DEMOS.map((d) => `${d.name.padEnd(16)} ${usernameOf(d.name)}`)) +
        "\n" +
        list("Residents", RESIDENTS.map((r) => `${r.name.padEnd(16)} ${usernameOf(r.name).padEnd(22)} ${r.building} · ${r.flat}`)),
    );
    console.log(`Created ${created.length} demo accounts; logins in ${LOGINS_FILE}`);
  }
} finally {
  await db.close();
}
