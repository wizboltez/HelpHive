import { mkdirSync } from "node:fs";
import { config } from "../config.js";

/**
 * The small slice of a Postgres client the app needs.
 * Backed by a real PostgreSQL server (DATABASE_URL) or embedded PGlite for zero-setup dev and tests.
 */
export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Postgres type ids: return DATE as 'YYYY-MM-DD' strings and bigint counts as numbers.
const DATE = 1082;
const INT8 = 20;

export function connect(): Promise<Db> {
  return config.databaseUrl ? connectPostgres(config.databaseUrl) : connectPglite(config.pgliteDir);
}

export async function connectPostgres(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  pg.types.setTypeParser(DATE, (value) => value);
  pg.types.setTypeParser(INT8, Number);
  const pool = new pg.Pool({ connectionString: url });

  const inTransaction = (client: import("pg").PoolClient): Db => {
    const tx: Db = {
      query: async (sql, params) => (await client.query(sql, params as any[])).rows,
      exec: async (sql) => void (await client.query(sql)),
      transaction: (fn) => fn(tx),
      close: async () => {},
    };
    return tx;
  };

  return {
    query: async (sql, params) => (await pool.query(sql, params as any[])).rows,
    exec: async (sql) => void (await pool.query(sql)),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(inTransaction(client));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Embedded Postgres (WASM). Pass no dataDir for an in-memory database. */
export async function connectPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create(dataDir, {
    parsers: { [DATE]: (value: string) => value, [INT8]: (value: string) => Number(value) },
  });

  const inTransaction = (client: import("@electric-sql/pglite").Transaction): Db => {
    const tx: Db = {
      query: async (sql, params) => (await client.query<any>(sql, params)).rows,
      exec: async (sql) => void (await client.exec(sql)),
      transaction: (fn) => fn(tx),
      close: async () => {},
    };
    return tx;
  };

  return {
    query: async (sql, params) => (await pg.query<any>(sql, params)).rows,
    exec: async (sql) => void (await pg.exec(sql)),
    transaction: (fn) => pg.transaction((client) => fn(inTransaction(client))),
    close: () => pg.close(),
  };
}
