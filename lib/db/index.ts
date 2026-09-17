import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

// Reuse the pool across hot reloads in dev, and keep it small for serverless.
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.__sql ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    // Neon's pooled endpoint does not support prepared statements.
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
