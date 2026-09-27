import { createInterface } from "node:readline/promises";
import { hashPassword } from "../lib/auth.js";
import { connect } from "./db.js";
import { migrate } from "./migrate.js";

/**
 *   npm run db:migrate     apply pending migrations
 *   npm run create-admin   create an admin account (asks for details)
 */
const command = process.argv[2];
const db = await connect();

try {
  if (command === "migrate") {
    const applied = await migrate(db);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date");
  } else if (command === "create-admin") {
    await migrate(db);
    await createAdmin();
  } else {
    console.log("Usage: tsx src/db/cli.ts <migrate | create-admin>");
    process.exitCode = 1;
  }
} finally {
  await db.close();
}

async function createAdmin() {
  // Reading lines through an iterator works both when typed and when piped in.
  const prompt = createInterface({ input: process.stdin });
  const lines = prompt[Symbol.asyncIterator]();
  const ask = async (question: string) => {
    process.stdout.write(question);
    return String((await lines.next()).value ?? "").trim();
  };

  const name = await ask("Full name: ");
  const username = await ask("Username: ");
  const email = await ask("Email: ");
  const phone = await ask("Phone: ");
  const password = await ask("Password (min 8 characters): ");
  prompt.close();

  if (!name || !username || !email || !phone || password.length < 8) {
    throw new Error("All fields are required and the password needs at least 8 characters");
  }
  const taken = await db.query("SELECT 1 FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)", [
    username,
    email,
  ]);
  if (taken.length) throw new Error("That username or email is already registered");

  await db.query(
    `INSERT INTO users (role, name, username, email, phone, password_hash) VALUES ('admin', $1, $2, $3, $4, $5)`,
    [name, username, email, phone, await hashPassword(password)],
  );
  console.log(`Admin "${username}" created. Log in through the app or POST /api/auth/login.`);
}
