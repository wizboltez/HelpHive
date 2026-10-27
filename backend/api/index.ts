import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/app.js";
import { connect } from "../src/db/db.js";

/**
 * Vercel entry point: the root vercel.json sends /api and /uploads here. Unlike src/index.ts it doesn't
 * listen on a port or run migrations; those run once per deploy in the build step (npm run db:migrate).
 */
const app = connect().then(createApp);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  (await app)(req, res);
}
