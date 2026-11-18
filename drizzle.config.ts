import { defineConfig } from "drizzle-kit";

// Used by `pnpm db:generate` to turn src/db/schema.ts into SQL migration files in ./drizzle.
// Applying them is done by scripts/migrate.mjs (works for both PGlite and real Postgres).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
});
