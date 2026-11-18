// Applies the SQL migrations in ./drizzle to the database in DATABASE_URL.
// Used for Neon (`DATABASE_URL=... pnpm db:migrate`) and in CI. Locally, `pnpm dev` migrates for you.
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. (For local development just run `pnpm dev`; it migrates automatically.)");
  process.exit(1);
}

const { Pool } = await import("pg");
const { drizzle } = await import("drizzle-orm/node-postgres");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("✓ Migrated DATABASE_URL");
} finally {
  await pool.end();
}
