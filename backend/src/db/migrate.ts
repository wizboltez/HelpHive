import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "./db.js";

const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));

/** Applies every .sql file in ./migrations that hasn't run yet, in filename order. */
export async function migrate(db: Db) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const applied = new Set(
    (await db.query<{ name: string }>("SELECT name FROM schema_migrations")).map((row) => row.name),
  );

  const pending = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql") && !applied.has(file))
    .sort();

  for (const file of pending) {
    const sql = readFileSync(`${migrationsDir}/${file}`, "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
  }
  return pending;
}
