import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import type { Db } from "../db/db.js";
import { checkPassword, hashPassword, me, requireAuth, signToken } from "../lib/auth.js";
import { badRequest, conflict, parse, unauthorized } from "../lib/http.js";
import { notifyAdmins } from "../lib/notify.js";

const USER_FIELDS = `u.id, u.role, u.name, u.username, u.email, u.phone, u.building, u.place, u.created_at AS "createdAt"`;

/** The signed-in user, plus helper profile status for workers. */
const ME_QUERY = `
  SELECT ${USER_FIELDS}, h.slug AS "helperSlug", h.verification,
         h.onboarded_at IS NOT NULL AS onboarded, '/uploads/photos/' || h.photo_file AS "photoUrl"
  FROM users u LEFT JOIN helpers h ON h.user_id = u.id WHERE u.id = $1`;

const name = z.string().trim().min(2).max(80);
const phone = z.string().trim().regex(/^\+?[0-9 ]{10,15}$/, "Enter a valid phone number");
const flat = z.string().trim().max(20);
const password = z.string().min(8, "Use at least 8 characters").max(100);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .refine((value) => config.allowedEmailDomains.includes(value.split("@")[1] ?? ""), {
    message: `Use an address ending in ${config.allowedEmailDomains.map((d) => `@${d}`).join(" or ")}`,
  });

const registerSchema = z
  .object({
    role: z.enum(["resident", "worker"]),
    name,
    username: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_.]{3,30}$/, "Use 3–30 letters, numbers, dots or underscores"),
    email,
    phone,
    building: z.string().trim().min(1, "Choose your building"),
    place: flat.default(""),
    password,
  })
  .refine((u) => u.role !== "resident" || u.place.length > 0, { message: "Enter your flat number", path: ["place"] });

const loginSchema = z.object({
  login: z.string().trim().min(1, "Enter your username or email"),
  password: z.string().min(1),
});

const updateSchema = z.object({ name, phone, building: z.string().trim().min(1), place: flat }).partial();

const passwordSchema = z.object({ currentPassword: z.string(), newPassword: password });

async function assertBuilding(db: Db, building: string) {
  const found = await db.query("SELECT 1 FROM buildings WHERE name = $1", [building]);
  if (!found.length) throw badRequest("Choose a building from the list");
}

export function authRoutes(db: Db) {
  const router = Router();

  // FR-01: residents and workers sign up themselves; admins are created with `npm run create-admin`.
  router.post("/register", async (req, res) => {
    const input = parse(registerSchema, req.body);
    await assertBuilding(db, input.building);
    const passwordHash = await hashPassword(input.password);

    const userId = await db.transaction(async (tx) => {
      const taken = await tx.query(
        "SELECT 1 FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)",
        [input.username, input.email],
      );
      if (taken.length) throw conflict("That username or email is already registered");

      const [{ id }] = await tx.query(
        `INSERT INTO users (role, name, username, email, phone, building, place, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [input.role, input.name, input.username, input.email, input.phone, input.building, input.place, passwordHash],
      );
      if (input.role === "worker") {
        await tx.query("INSERT INTO helpers (user_id, slug) VALUES ($1, $2)", [id, await uniqueSlug(tx, input.name)]);
      }
      return id;
    });

    const [user] = await db.query(ME_QUERY, [userId]);
    res.status(201).json({ token: signToken(user), user });
  });

  // UC-01: log in with username or email.
  router.post("/login", async (req, res) => {
    const input = parse(loginSchema, req.body);
    const [row] = await db.query(
      "SELECT id, password_hash, is_active FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)",
      [input.login],
    );
    if (!row || !(await checkPassword(input.password, row.password_hash))) {
      throw unauthorized("Wrong username/email or password");
    }
    if (!row.is_active) throw unauthorized("This account has been deactivated");

    const [user] = await db.query(ME_QUERY, [row.id]);
    res.json({ token: signToken(user), user });
  });

  router.get("/me", requireAuth(db), async (req, res) => {
    const [user] = await db.query(ME_QUERY, [me(req).id]);
    res.json(user);
  });

  // Account settings. A helper's name is part of their public profile, so it's changed
  // from the profile page instead (and needs admin approval once verified).
  router.patch("/me", requireAuth(db), async (req, res) => {
    const input = parse(updateSchema, req.body);
    const user = me(req);
    if (input.name && user.role === "worker") throw badRequest("Change your name from your profile page");
    if (input.building) await assertBuilding(db, input.building);

    await db.query(
      `UPDATE users SET name = coalesce($2, name), phone = coalesce($3, phone),
              building = coalesce($4, building), place = coalesce($5, place)
       WHERE id = $1`,
      [user.id, input.name ?? null, input.phone ?? null, input.building ?? null, input.place ?? null],
    );
    const [updated] = await db.query(ME_QUERY, [user.id]);
    res.json(updated);
  });

  router.post("/me/password", requireAuth(db), async (req, res) => {
    const input = parse(passwordSchema, req.body);
    const [row] = await db.query("SELECT password_hash FROM users WHERE id = $1", [me(req).id]);
    if (!(await checkPassword(input.currentPassword, row.password_hash))) {
      throw unauthorized("Current password is wrong");
    }
    await db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      me(req).id,
      await hashPassword(input.newPassword),
    ]);
    res.status(204).end();
  });

  return router;
}

/** Called when a new helper finishes onboarding, so admins know there's someone to verify. */
export async function announceNewHelper(db: Db, helperName: string) {
  await notifyAdmins(db, "New helper to verify", `${helperName} finished signing up`, "/admin?tab=verification");
}

/** "Sunita Devi" → "sunita-devi", or "sunita-devi-2" if taken. */
async function uniqueSlug(db: Db, name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "helper";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await db.query("SELECT 1 FROM helpers WHERE slug = $1", [slug]);
    if (!taken.length) return slug;
  }
}
