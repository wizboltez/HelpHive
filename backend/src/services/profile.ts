import type { Db } from "../db/db.js";
import { notifyAdmins } from "../lib/notify.js";
import { removeUpload } from "../lib/uploads.js";

/** Fields of a helper's public profile. Every edit to these needs admin approval once verified. */
export type ProfileChanges = {
  name?: string;
  categories?: string[];
  summary?: string;
  ratePerVisit?: number;
  services?: { label: string; price: number; unit: "visit" | "event"; isAvailable: boolean }[];
  photoFile?: string;
};

/** Writes changes straight to the live profile. */
export async function applyProfileChanges(tx: Db, helperId: string, changes: ProfileChanges) {
  if (changes.name !== undefined) {
    await tx.query("UPDATE users SET name = $2 WHERE id = $1", [helperId, changes.name]);
  }
  await tx.query(
    `UPDATE helpers SET categories = coalesce($2, categories), summary = coalesce($3, summary),
            rate_per_visit = coalesce($4, rate_per_visit)
     WHERE user_id = $1`,
    [helperId, changes.categories ?? null, changes.summary ?? null, changes.ratePerVisit ?? null],
  );
  if (changes.services) {
    await tx.query("DELETE FROM helper_services WHERE helper_id = $1", [helperId]);
    for (const s of changes.services) {
      await tx.query(
        "INSERT INTO helper_services (helper_id, label, price, unit, is_available) VALUES ($1, $2, $3, $4, $5)",
        [helperId, s.label, s.price, s.unit, s.isAvailable],
      );
    }
  }
  if (changes.photoFile) {
    const [old] = await tx.query("SELECT photo_file FROM helpers WHERE user_id = $1", [helperId]);
    await tx.query("UPDATE helpers SET photo_file = $2 WHERE user_id = $1", [helperId, changes.photoFile]);
    await removeUpload("photos", old.photo_file);
  }
}

/**
 * Unverified helpers, and helpers still onboarding, edit freely (the admin reviews everything at verification).
 * Verified helpers' edits are queued for approval, merged into any request already waiting.
 * Returns true if the change was queued rather than applied.
 */
export async function saveProfileChanges(db: Db, helperId: string, changes: ProfileChanges) {
  const [helper] = await db.query(
    "SELECT verification, onboarded_at IS NOT NULL AS onboarded FROM helpers WHERE user_id = $1",
    [helperId],
  );
  if (helper.verification !== "verified" || !helper.onboarded) {
    await db.transaction((tx) => applyProfileChanges(tx, helperId, changes));
    return false;
  }

  const [pending] = await db.query(
    "SELECT id, changes FROM profile_changes WHERE helper_id = $1 AND status = 'pending'",
    [helperId],
  );
  if (pending) {
    // A newer photo replaces one that was still waiting for approval.
    if (changes.photoFile && pending.changes.photoFile) await removeUpload("photos", pending.changes.photoFile);
    await db.query("UPDATE profile_changes SET changes = $2::jsonb, created_at = now() WHERE id = $1", [
      pending.id,
      JSON.stringify({ ...pending.changes, ...changes }),
    ]);
  } else {
    await db.query("INSERT INTO profile_changes (helper_id, changes) VALUES ($1, $2::jsonb)", [
      helperId,
      JSON.stringify(changes),
    ]);
    const [{ name }] = await db.query("SELECT name FROM users WHERE id = $1", [helperId]);
    await notifyAdmins(db, "Profile change to review", `${name} edited their profile`, "/admin?tab=changes");
  }
  return true;
}
