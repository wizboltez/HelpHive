import type { Db } from "../db/db.js";

/**
 * Adds an in-app notification. `link` is the page the app opens when it's clicked.
 * Could later also send SMS / push.
 */
export async function notify(db: Db, userId: string, title: string, body = "", link: string | null = null) {
  await db.query("INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)", [
    userId,
    title,
    body,
    link,
  ]);
}

/** Notifies every active admin. */
export async function notifyAdmins(db: Db, title: string, body: string, link: string) {
  const admins = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active");
  for (const admin of admins) await notify(db, admin.id, title, body, link);
}
