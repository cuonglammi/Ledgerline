// `pnpm dev` entry point.
//
// With DATABASE_URL set (e.g. your Neon dev branch): migrates it and starts `next dev`.
// Without it: starts a local Postgres-compatible server (PGlite) on 127.0.0.1:54329, saved in
// .data/pglite, migrates it, and starts `next dev` pointed at it. No Docker or accounts needed.
//
// Why a separate server instead of opening PGlite inside the app? Next.js runs several worker
// processes in development; if each opened the database files directly they would corrupt them.
// Here exactly one process owns the files, and the app talks to it like any normal Postgres.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const migrationsFolder = "./drizzle";

async function migrateUrl(url) {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

let shutdown = async () => {};

if (process.env.DATABASE_URL) {
  await migrateUrl(process.env.DATABASE_URL);
  console.log("✓ Migrated DATABASE_URL");
} else {
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  const port = Number(process.env.PGLITE_PORT ?? 54329);
  mkdirSync(dir, { recursive: true });

  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const db = await PGlite.create(dir);
  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port, maxConnections: 20 });
  await server.start();

  const url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
  process.env.DATABASE_URL = url;
  await migrateUrl(url);
  console.log(`✓ Local database ready at ${url} (files in ${dir})`);

  shutdown = async () => {
    await server.stop();
    await db.close(); // a clean close keeps the database files consistent
  };
}

const next = spawn("next", ["dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  next.kill("SIGTERM");
  await shutdown().catch((err) => console.error("Error closing local database:", err));
  process.exit(code);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
next.on("exit", (code) => stop(code ?? 0));
