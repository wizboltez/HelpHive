import { createApp } from "./app.js";
import { config } from "./config.js";
import { connect } from "./db/db.js";
import { migrate } from "./db/migrate.js";

const db = await connect();
const applied = await migrate(db);
if (applied.length) console.log(`Applied migrations: ${applied.join(", ")}`);

const [{ admins }] = await db.query("SELECT count(*)::int AS admins FROM users WHERE role = 'admin'");
if (!admins) console.warn("No admin account yet — create one with: npm run create-admin");

const server = createApp(db).listen(config.port, () => {
  const database = config.databaseUrl ? "PostgreSQL" : `embedded PGlite (${config.pgliteDir})`;
  console.log(`HelpHive API on http://localhost:${config.port} · database: ${database}`);
});

// Finish in-flight requests and close the database cleanly on Ctrl+C / container stop.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
}
