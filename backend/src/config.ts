// Loads backend/.env if present (Node 22 built-in, no dotenv needed).
try {
  process.loadEnvFile();
} catch {
  // no .env file — fall back to defaults below
}

const env = process.env;
const isProduction = env.NODE_ENV === "production";

if (isProduction && !env.JWT_SECRET) throw new Error("JWT_SECRET must be set in production");

export const config = {
  port: Number(env.PORT ?? 4000),
  /** Set to use a real PostgreSQL server; otherwise an embedded PGlite database is used. */
  databaseUrl: env.DATABASE_URL,
  pgliteDir: env.PGLITE_DIR ?? ".data/pglite",
  uploadDir: env.UPLOAD_DIR ?? ".data/uploads",
  jwtSecret: env.JWT_SECRET ?? "dev-secret-change-me",
  tokenTtl: env.TOKEN_TTL ?? "7d",
  bcryptRounds: 10,
  /**
   * Website address(es) allowed to call the API, comma separated. When unset, development accepts
   * any origin (handy for testing over Wi-Fi; logins use tokens, not cookies) and production none.
   */
  corsOrigin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(",") : !isProduction,
  /**
   * Which proxies to trust for the client's IP (used by the login rate limit). By default only
   * proxies on this machine, e.g. the website's dev server. Set TRUST_PROXY=true behind nginx, Render, etc.
   */
  trustProxy: env.TRUST_PROXY === "true" ? true : "loopback",
  /** Max login/register attempts per IP per 15 minutes. */
  authRateLimit: Number(env.AUTH_RATE_LIMIT ?? 20),
  /** Email providers accepted at sign-up, comma separated. */
  allowedEmailDomains: (env.ALLOWED_EMAIL_DOMAINS ?? "gmail.com,outlook.com").split(",").map((d) => d.trim().toLowerCase()),

  // Business rules
  timezone: env.TIMEZONE ?? "Asia/Kolkata",
  convenienceFee: Number(env.CONVENIENCE_FEE ?? 49),
  cancelWindowHours: Number(env.CANCEL_WINDOW_HOURS ?? 24),
  maxDoorCodeAttempts: Number(env.MAX_DOOR_CODE_ATTEMPTS ?? 5),
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 5),
};
