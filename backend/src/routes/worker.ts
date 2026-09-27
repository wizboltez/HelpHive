import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/db.js";
import { me } from "../lib/auth.js";
import { CATEGORIES } from "../lib/catalog.js";
import { monthRange, today } from "../lib/dates.js";
import { badRequest, conflict, isoDate, notFound, parse, uuid } from "../lib/http.js";
import { notify, notifyAdmins } from "../lib/notify.js";
import { acceptFile, DOCUMENT_TYPES, IMAGE_TYPES, removeUpload, uploadPath } from "../lib/uploads.js";
import { saveProfileChanges } from "../services/profile.js";
import { announceNewHelper } from "./auth.js";

const detailsSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    categories: z.array(z.enum(CATEGORIES)).min(1, "Pick at least one category").max(CATEGORIES.length),
    summary: z.string().trim().max(300),
    ratePerVisit: z.number().int().min(1, "Set a rate above ₹0").max(100_000),
  })
  .partial();

const servicesSchema = z.object({
  services: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        price: z.number().int().min(0).max(100_000),
        unit: z.enum(["visit", "event"]),
        isAvailable: z.boolean().default(true),
      }),
    )
    .max(20),
});

const documentSchema = z
  .object({
    docType: z.enum(["id_proof", "address_proof", "police_verification", "other"]),
    docLabel: z.string().trim().max(80).optional(),
  })
  .refine((d) => d.docType !== "other" || !!d.docLabel, { message: "Name the document", path: ["docLabel"] });

export const DOCUMENT_FIELDS = `id, doc_type AS "docType", doc_label AS "docLabel", mime_type AS "mimeType", created_at AS "createdAt"`;

const leaveSchema = z
  .object({ startDate: isoDate, endDate: isoDate, reason: z.string().trim().max(300).default("") })
  .refine((l) => l.endDate >= l.startDate, { message: "End date must be on or after start date", path: ["endDate"] });

const saved = (queued: boolean) =>
  queued ? { queued: true, message: "Sent to the admin for approval" } : { queued: false, message: "Saved" };

/** FR-02: a helper manages their own profile, services, documents, leave and sees earnings. */
export function workerRoutes(db: Db) {
  const router = Router();

  router.get("/profile", async (req, res) => {
    const id = me(req).id;
    const [profile] = await db.query(
      `SELECT u.name, h.slug, h.categories, h.summary, h.rate_per_visit AS "ratePerVisit", h.is_accepting AS "isAccepting",
              h.verification, h.verification_note AS "verificationNote", h.onboarded_at IS NOT NULL AS onboarded,
              '/uploads/photos/' || h.photo_file AS "photoUrl"
       FROM helpers h JOIN users u ON u.id = h.user_id WHERE h.user_id = $1`,
      [id],
    );
    const [services, documents, leaves, changes] = await Promise.all([
      db.query(
        `SELECT id, label, price, unit, is_available AS "isAvailable" FROM helper_services WHERE helper_id = $1 ORDER BY label`,
        [id],
      ),
      db.query(`SELECT ${DOCUMENT_FIELDS} FROM helper_documents WHERE helper_id = $1 ORDER BY created_at`, [id]),
      db.query(
        `SELECT id, start_date AS "startDate", end_date AS "endDate", reason
         FROM helper_leaves WHERE helper_id = $1 AND end_date >= $2 ORDER BY start_date`,
        [id, today()],
      ),
      db.query(
        `SELECT id, changes, status, note, created_at AS "createdAt", reviewed_at AS "reviewedAt"
         FROM profile_changes WHERE helper_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id],
      ),
    ]);
    res.json({ ...profile, services, documents, leaves, latestChange: changes[0] ?? null });
  });

  // Name, categories, about and rate. Needs admin approval once verified.
  router.patch("/profile", async (req, res) => {
    const input = parse(detailsSchema, req.body);
    res.json(saved(await saveProfileChanges(db, me(req).id, input)));
  });

  // Replaces the list of extra services. Needs admin approval once verified.
  router.put("/services", async (req, res) => {
    const { services } = parse(servicesSchema, req.body);
    res.json(saved(await saveProfileChanges(db, me(req).id, { services })));
  });

  // Profile photo (multipart field "file"). Needs admin approval once verified.
  router.put("/photo", ...acceptFile("photos", IMAGE_TYPES), async (req, res) => {
    res.json(saved(await saveProfileChanges(db, me(req).id, { photoFile: req.file!.filename })));
  });

  // Availability is not part of the reviewed profile, so it changes immediately.
  router.put("/availability", async (req, res) => {
    const { isAccepting } = parse(z.object({ isAccepting: z.boolean() }), req.body);
    await db.query("UPDATE helpers SET is_accepting = $2 WHERE user_id = $1", [me(req).id, isAccepting]);
    res.json({ isAccepting });
  });

  // FR-04: upload a verification document (multipart: "docType", optional "docLabel", "file").
  // Uploading after a rejection sends the profile back for review.
  router.post("/documents", ...acceptFile("documents", DOCUMENT_TYPES), async (req, res) => {
    if (!documentSchema.safeParse(req.body).success) await removeUpload("documents", req.file!.filename);
    const input = parse(documentSchema, req.body);
    const id = me(req).id;
    const [doc] = await db.query(
      `INSERT INTO helper_documents (helper_id, doc_type, doc_label, file_name, mime_type) VALUES ($1, $2, $3, $4, $5)
       RETURNING ${DOCUMENT_FIELDS}`,
      [id, input.docType, input.docType === "other" ? input.docLabel : null, req.file!.filename, req.file!.mimetype],
    );
    const [helper] = await db.query(
      `UPDATE helpers SET verification = CASE WHEN verification = 'rejected' THEN 'pending' ELSE verification END
       WHERE user_id = $1 RETURNING onboarded_at IS NOT NULL AS onboarded`,
      [id],
    );
    // During onboarding the admin is told once, when the helper finishes.
    if (helper.onboarded) {
      await notifyAdmins(db, "New verification document", "A helper uploaded a document", "/admin?tab=verification");
    }
    res.status(201).json(doc);
  });

  router.get("/documents/:id/file", async (req, res) => {
    const [doc] = await db.query("SELECT file_name, mime_type FROM helper_documents WHERE id = $1 AND helper_id = $2", [
      parse(uuid, req.params.id),
      me(req).id,
    ]);
    if (!doc) throw notFound("Document");
    res.type(doc.mime_type).sendFile(uploadPath("documents", doc.file_name), { dotfiles: "allow" });
  });

  // Last onboarding step: checks the profile is complete and hands it to the admin for verification.
  router.post("/onboarding/complete", async (req, res) => {
    const id = me(req).id;
    const [helper] = await db.query(
      `SELECT u.name, h.categories, h.rate_per_visit, h.onboarded_at,
              (SELECT count(*)::int FROM helper_documents d WHERE d.helper_id = h.user_id) AS documents
       FROM helpers h JOIN users u ON u.id = h.user_id WHERE h.user_id = $1`,
      [id],
    );
    if (helper.onboarded_at) throw conflict("You've already finished onboarding");
    if (!helper.categories.length) throw badRequest("Pick at least one category");
    if (helper.rate_per_visit <= 0) throw badRequest("Set your rate per visit");
    if (!helper.documents) throw badRequest("Upload at least one ID document");

    await db.query("UPDATE helpers SET onboarded_at = now() WHERE user_id = $1", [id]);
    await announceNewHelper(db, helper.name);
    res.json({ onboarded: true });
  });

  router.post("/leaves", async (req, res) => {
    const input = parse(leaveSchema, req.body);
    if (input.startDate < today()) throw badRequest("Leave can't start in the past");
    const id = me(req).id;

    const [leave] = await db.query(
      `INSERT INTO helper_leaves (helper_id, start_date, end_date, reason) VALUES ($1, $2, $3, $4)
       RETURNING id, start_date AS "startDate", end_date AS "endDate", reason`,
      [id, input.startDate, input.endDate, input.reason],
    );

    // Let every resident with a booking in that period know.
    const affected = await db.query(
      `SELECT DISTINCT b.resident_id, u.name FROM bookings b JOIN users u ON u.id = b.helper_id
       WHERE b.helper_id = $1 AND b.status = 'confirmed' AND b.start_date <= $3 AND b.end_date >= $2`,
      [id, input.startDate, input.endDate],
    );
    for (const row of affected) {
      await notify(db, row.resident_id, `${row.name} is on leave`, `${input.startDate} to ${input.endDate}`, "/schedule");
    }
    res.status(201).json(leave);
  });

  router.delete("/leaves/:id", async (req, res) => {
    const deleted = await db.query(
      "DELETE FROM helper_leaves WHERE id = $1 AND helper_id = $2 AND start_date > $3 RETURNING id",
      [parse(uuid, req.params.id), me(req).id, today()],
    );
    if (!deleted.length) throw notFound("Upcoming leave");
    res.status(204).end();
  });

  // Earnings from completed visits: rate + per-visit extras for each visit, plus one-off extras.
  router.get("/earnings", async (req, res) => {
    const { from, to } = parse(
      z.object({ from: isoDate, to: isoDate }).partial().transform((q) => ({
        ...monthRange(today().slice(0, 7)),
        ...q,
      })),
      req.query,
    );
    if (to < from) throw badRequest("'to' must be on or after 'from'");

    const rows = await db.query(
      `SELECT b.id AS "bookingId", b.flat, b.plan, b.start_date AS "startDate", b.rate_per_visit AS rate, b.extras,
              count(v.id)::int AS visits
       FROM bookings b
       JOIN visits v ON v.booking_id = b.id AND v.check_out_at IS NOT NULL AND v.visit_date BETWEEN $2 AND $3
       WHERE b.helper_id = $1
       GROUP BY b.id ORDER BY b.flat`,
      [me(req).id, from, to],
    );

    const byHouse = rows.map((row) => {
      const extras = row.extras as { unit: string; price: number }[];
      const perVisit = row.rate + extras.filter((e) => e.unit === "visit").reduce((sum, e) => sum + e.price, 0);
      const oneOff = row.startDate >= from && row.startDate <= to
        ? extras.filter((e) => e.unit === "event").reduce((sum, e) => sum + e.price, 0)
        : 0;
      return { bookingId: row.bookingId, flat: row.flat, plan: row.plan, visits: row.visits, amount: row.visits * perVisit + oneOff };
    });

    res.json({
      from,
      to,
      totalVisits: byHouse.reduce((sum, h) => sum + h.visits, 0),
      totalAmount: byHouse.reduce((sum, h) => sum + h.amount, 0),
      byHouse,
    });
  });

  return router;
}
