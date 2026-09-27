import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/db.js";
import { me, requireRole } from "../lib/auth.js";
import { parse, uuid } from "../lib/http.js";
import { notifyAdmins } from "../lib/notify.js";

export const COMPLAINT_FIELDS = `
  c.id, c.subject, c.description, c.status, c.resolution, c.helper_id AS "helperId", c.booking_id AS "bookingId",
  c.raised_by AS "raisedBy", u.name AS "raisedByName", c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;

const complaintSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  helperId: uuid.optional(),
  bookingId: uuid.optional(),
});

/** Residents and helpers raise complaints; admins resolve them (see admin routes). */
export function complaintRoutes(db: Db) {
  const router = Router();

  router.post("/", requireRole("resident", "worker"), async (req, res) => {
    const input = parse(complaintSchema, req.body);
    const [complaint] = await db.query(
      `INSERT INTO complaints (raised_by, subject, description, helper_id, booking_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, status, created_at AS "createdAt"`,
      [me(req).id, input.subject, input.description, input.helperId ?? null, input.bookingId ?? null],
    );
    await notifyAdmins(db, "New complaint", input.subject, "/admin?tab=complaints");
    res.status(201).json(complaint);
  });

  // Your own complaints (admins see all).
  router.get("/", async (req, res) => {
    const user = me(req);
    const complaints = await db.query(
      `SELECT ${COMPLAINT_FIELDS} FROM complaints c JOIN users u ON u.id = c.raised_by
       WHERE $1::uuid IS NULL OR c.raised_by = $1 ORDER BY c.created_at DESC`,
      [user.role === "admin" ? null : user.id],
    );
    res.json(complaints);
  });

  return router;
}
