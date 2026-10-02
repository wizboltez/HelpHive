import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/db.js";
import { me } from "../lib/auth.js";
import { today, weekdayOf } from "../lib/dates.js";
import { badRequest, conflict, isoDate, notFound, parse, uuid } from "../lib/http.js";
import { notify } from "../lib/notify.js";
import { removeUpload, uploadPath } from "../lib/uploads.js";
import { applyProfileChanges, type ProfileChanges } from "../services/profile.js";
import { BOOKING_SELECT, refreshStatuses, type Booking } from "../services/bookings.js";
import { COMPLAINT_FIELDS } from "./complaints.js";

/** FR-09: admin dashboard — verify helpers, watch bookings and attendance, handle complaints. */
const buildingSchema = z.object({ name: z.string().trim().min(1).max(60) });

export function adminRoutes(db: Db) {
  const router = Router();

  router.get("/stats", async (_req, res) => {
    await refreshStatuses(db);
    const [stats] = await db.query(
      `SELECT
         (SELECT count(*) FROM users WHERE role = 'resident')::int AS residents,
         (SELECT count(*) FROM users WHERE role = 'worker')::int AS workers,
         (SELECT count(*) FROM helpers WHERE verification = 'pending' AND onboarded_at IS NOT NULL)::int AS "pendingVerifications",
         (SELECT count(*) FROM profile_changes WHERE status = 'pending')::int AS "pendingProfileChanges",
         (SELECT count(*) FROM bookings WHERE status = 'pending')::int AS "pendingBookings",
         (SELECT count(*) FROM bookings WHERE status = 'confirmed')::int AS "activeBookings",
         (SELECT count(*) FROM complaints WHERE status = 'open')::int AS "openComplaints",
         (SELECT count(*) FROM visits WHERE visit_date = $1 AND check_in_at IS NOT NULL)::int AS "checkInsToday"`,
      [today()],
    );
    res.json(stats);
  });

  // FR-04 / UC-05: helpers and their documents, filterable by verification status.
  // Helpers still in onboarding aren't listed until they finish.
  router.get("/helpers", async (req, res) => {
    const { verification } = parse(
      z.object({ verification: z.enum(["pending", "verified", "rejected"]).optional() }),
      req.query,
    );
    const helpers = await db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.place, u.is_active AS "isActive", u.created_at AS "createdAt",
              u.building, h.slug, h.categories, h.summary, h.rate_per_visit AS "ratePerVisit",
              '/uploads/photos/' || h.photo_file AS "photoUrl", h.verification, h.verification_note AS "verificationNote",
              coalesce(json_agg(json_build_object('id', d.id, 'docType', d.doc_type, 'docLabel', d.doc_label,
                                                  'mimeType', d.mime_type, 'createdAt', d.created_at) ORDER BY d.created_at)
                       FILTER (WHERE d.id IS NOT NULL), '[]') AS documents
       FROM helpers h
       JOIN users u ON u.id = h.user_id
       LEFT JOIN helper_documents d ON d.helper_id = h.user_id
       WHERE h.onboarded_at IS NOT NULL AND ($1::text IS NULL OR h.verification = $1)
       GROUP BY u.id, h.user_id ORDER BY u.created_at`,
      [verification ?? null],
    );
    res.json(helpers);
  });

  // View a helper's uploaded document (UC-05 "verify documents").
  router.get("/documents/:id/file", async (req, res) => {
    const [doc] = await db.query("SELECT file_name, mime_type FROM helper_documents WHERE id = $1", [
      parse(uuid, req.params.id),
    ]);
    if (!doc) throw notFound("Document");
    res.type(doc.mime_type).sendFile(uploadPath("documents", doc.file_name), { dotfiles: "allow" });
  });

  router.post("/helpers/:id/verification", async (req, res) => {
    const input = parse(
      z.object({ status: z.enum(["verified", "rejected"]), note: z.string().trim().max(300).default("") }),
      req.body,
    );
    const id = parse(uuid, req.params.id);
    const [helper] = await db.query(
      `UPDATE helpers SET verification = $2, verification_note = $3,
              verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE NULL END
       WHERE user_id = $1 RETURNING user_id AS id, slug, verification, verification_note AS "verificationNote"`,
      [id, input.status, input.note],
    );
    if (!helper) throw notFound("Helper");

    const message = input.status === "verified" ? "You're verified! Residents can now book you." : "Verification was not approved";
    await notify(db, id, message, input.note, "/worker/profile");
    res.json(helper);
  });

  // Profile edits from verified helpers, waiting for approval.
  router.get("/profile-changes", async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(["pending", "approved", "rejected"]).default("pending") }), req.query);
    const changes = await db.query(
      `SELECT c.id, c.changes, c.status, c.note, c.created_at AS "createdAt", c.reviewed_at AS "reviewedAt",
              json_build_object('id', u.id, 'name', u.name, 'slug', h.slug, 'categories', h.categories,
                                'summary', h.summary, 'ratePerVisit', h.rate_per_visit,
                                'photoUrl', '/uploads/photos/' || h.photo_file) AS current,
              coalesce((SELECT json_agg(json_build_object('label', s.label, 'price', s.price, 'unit', s.unit,
                                                          'isAvailable', s.is_available) ORDER BY s.label)
                        FROM helper_services s WHERE s.helper_id = h.user_id), '[]') AS "currentServices"
       FROM profile_changes c JOIN helpers h ON h.user_id = c.helper_id JOIN users u ON u.id = h.user_id
       WHERE c.status = $1 ORDER BY c.created_at`,
      [status],
    );
    res.json(changes);
  });

  router.post("/profile-changes/:id", async (req, res) => {
    const input = parse(
      z.object({ status: z.enum(["approved", "rejected"]), note: z.string().trim().max(300).default("") }),
      req.body,
    );
    const id = parse(uuid, req.params.id);
    const change = await db.transaction(async (tx) => {
      const [change] = await tx.query(
        `UPDATE profile_changes SET status = $2, note = $3, reviewed_at = now()
         WHERE id = $1 AND status = 'pending' RETURNING helper_id, changes`,
        [id, input.status, input.note],
      );
      if (!change) throw notFound("Pending change");
      if (input.status === "approved") await applyProfileChanges(tx, change.helper_id, change.changes);
      return change as { helper_id: string; changes: ProfileChanges };
    });
    if (input.status === "rejected") await removeUpload("photos", change.changes.photoFile ?? null);

    const title = input.status === "approved" ? "Your profile changes are live" : "Your profile changes were not approved";
    await notify(db, change.helper_id, title, input.note, "/worker/profile");
    res.json({ id, status: input.status });
  });

  // Buildings residents and helpers choose from at sign-up.
  router.post("/buildings", async (req, res) => {
    const { name } = parse(buildingSchema, req.body);
    const added = await db.query("INSERT INTO buildings (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING name", [name]);
    if (!added.length) throw conflict("That building already exists");
    res.status(201).json({ name });
  });

  // Rename a building. People in it follow automatically (ON UPDATE CASCADE);
  // the flat label saved on their bookings ("Tower A · 402") is updated to match.
  router.patch("/buildings/:name", async (req, res) => {
    const oldName = req.params.name;
    const { name } = parse(buildingSchema, req.body);
    if (name === oldName) return res.json({ name });

    await db.transaction(async (tx) => {
      const taken = await tx.query("SELECT 1 FROM buildings WHERE name = $1", [name]);
      if (taken.length) throw conflict("That building already exists");
      const renamed = await tx.query("UPDATE buildings SET name = $2 WHERE name = $1 RETURNING name", [oldName, name]);
      if (!renamed.length) throw notFound("Building");
      await tx.query(
        `UPDATE bookings SET flat = $2 || substr(flat, length($1) + 1)
         WHERE flat = $1 OR left(flat, length($1) + 3) = $1 || ' · '`,
        [oldName, name],
      );
    });
    res.json({ name });
  });

  router.delete("/buildings/:name", async (req, res) => {
    const name = req.params.name;
    const inUse = await db.query("SELECT 1 FROM users WHERE building = $1 LIMIT 1", [name]);
    if (inUse.length) throw conflict("People live in or serve this building, so it can't be removed");
    const removed = await db.query("DELETE FROM buildings WHERE name = $1 RETURNING name", [name]);
    if (!removed.length) throw notFound("Building");
    res.status(204).end();
  });

  router.get("/users", async (req, res) => {
    const { role } = parse(z.object({ role: z.enum(["resident", "worker", "admin"]).optional() }), req.query);
    const users = await db.query(
      `SELECT id, role, name, username, email, phone, building, place, is_active AS "isActive", created_at AS "createdAt"
       FROM users WHERE $1::text IS NULL OR role = $1 ORDER BY created_at`,
      [role ?? null],
    );
    res.json(users);
  });

  // Deactivated users can't log in and their existing tokens stop working.
  router.patch("/users/:id", async (req, res) => {
    const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
    const id = parse(uuid, req.params.id);
    if (id === me(req).id) throw badRequest("You can't deactivate your own account");
    const [user] = await db.query(
      `UPDATE users SET is_active = $2 WHERE id = $1 RETURNING id, name, role, is_active AS "isActive"`,
      [id, isActive],
    );
    if (!user) throw notFound("User");
    res.json(user);
  });

  // Every visit booked on a date, and whether the helper checked in / out.
  router.get("/attendance", async (req, res) => {
    const { date } = parse(z.object({ date: isoDate.default(today()) }), req.query);
    const bookings = await db.query<Booking>(
      `${BOOKING_SELECT}
       WHERE b.status IN ('confirmed', 'completed') AND $1 BETWEEN b.start_date AND b.end_date AND $2 = ANY(b.days)
       ORDER BY b.start_time`,
      [date, weekdayOf(date)],
    );
    const visits = await db.query(
      `SELECT booking_id, check_in_at AS "checkInAt", check_out_at AS "checkOutAt" FROM visits WHERE visit_date = $1`,
      [date],
    );
    const byBooking = new Map(visits.map((v) => [v.booking_id, v]));

    res.json(
      bookings.map((b) => {
        const visit = byBooking.get(b.id);
        const state = visit?.checkOutAt ? "done" : visit?.checkInAt ? "inside" : date < today() ? "missed" : "upcoming";
        return {
          bookingId: b.id,
          helper: { id: b.helperId, name: b.helperName },
          resident: { id: b.residentId, name: b.residentName },
          flat: b.flat,
          startTime: b.startTime,
          endTime: b.endTime,
          state,
          checkInAt: visit?.checkInAt ?? null,
          checkOutAt: visit?.checkOutAt ?? null,
        };
      }),
    );
  });

  router.patch("/complaints/:id", async (req, res) => {
    const input = parse(
      z.object({ status: z.enum(["open", "resolved", "dismissed"]), resolution: z.string().trim().max(1000).default("") }),
      req.body,
    );
    const [updated] = await db.query(
      `UPDATE complaints SET status = $2, resolution = $3, updated_at = now() WHERE id = $1 RETURNING id`,
      [parse(uuid, req.params.id), input.status, input.resolution],
    );
    if (!updated) throw notFound("Complaint");

    const [complaint] = await db.query(
      `SELECT ${COMPLAINT_FIELDS} FROM complaints c JOIN users u ON u.id = c.raised_by WHERE c.id = $1`,
      [updated.id],
    );
    await notify(db, complaint.raisedBy, `Your complaint was ${input.status}`, input.resolution, "/complaints");
    res.json(complaint);
  });

  return router;
}
