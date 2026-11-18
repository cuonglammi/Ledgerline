import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/**
 * One Postgres connection pool for the whole app.
 * - Production: DATABASE_URL is your Neon connection string.
 * - Development: `pnpm dev` starts a local database and sets DATABASE_URL for you (see scripts/dev.mjs).
 */
function createDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Start the app with `pnpm dev` (it runs a local database), " +
        "or set DATABASE_URL to your Neon connection string.",
    );
  }
  const pool = new Pool({ connectionString, max: 5 });
  return drizzle(pool, { schema });
}

// Created on first use (not at import), so `next build` works without a database.
// Kept on globalThis so hot reloads in development reuse one pool.
const globalForDb = globalThis as unknown as { __db?: Database };
function getDb(): Database {
  return (globalForDb.__db ??= createDb());
}

export const db = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
