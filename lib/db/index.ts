import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

// Reuse the pool across hot reloads in dev, and keep it small for serverless.
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres>; __db?: Database };

function connect(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }

  const sql =
    globalForDb.__sql ??
    postgres(connectionString, {
      max: process.env.NODE_ENV === "production" ? 1 : 5,
      // Neon's pooled endpoint does not support prepared statements.
      prepare: false,
    });

  if (process.env.NODE_ENV !== "production") globalForDb.__sql = sql;
  return drizzle(sql, { schema });
}

/**
 * Connects on first use rather than on import.
 *
 * Next evaluates every route module while building, so throwing at import time made
 * the whole build depend on a reachable database: `next build` failed with "Failed to
 * collect page data" on any machine without DATABASE_URL set. Deferring it means the
 * app builds anywhere and only complains when something actually asks for data —
 * which is also a far clearer place to read the error.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    globalForDb.__db ??= connect();
    const value = Reflect.get(globalForDb.__db, property, globalForDb.__db);
    return typeof value === "function" ? value.bind(globalForDb.__db) : value;
  },
});

export { schema };
