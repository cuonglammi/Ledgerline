# Ledgerline

**AI accounts payable for small businesses.** Forward an invoice, and Ledgerline reads it, checks it against your purchase orders, routes it for approval, and exports it to your books.

> **Status:** Week 2 of 8. Upload an invoice and Claude reads it into structured fields; a review screen shows the PDF beside the fields, highlights where each value came from, and saves human corrections. The eval harness is next. See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## The problem

<!-- Write this in your own words before you go further. It becomes your pitch.
     Who has the problem? How do they handle it today? What does it cost them? -->

A 30-person landscaping company gets around 200 vendor invoices a month as PDFs, photos and email attachments. Their bookkeeper types each one into QuickBooks by hand, which takes hours and occasionally pays the same invoice twice.

## Run it locally

You need Node 22+ and pnpm. No accounts or Docker required.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000, create an account, name your workspace, and upload a PDF.

`pnpm dev` starts a local Postgres-compatible database ([PGlite](https://pglite.dev)) saved in `.data/pglite`, applies the migrations, then starts Next.js. Uploaded files go to `.data/uploads`. Delete the `.data` folder to start fresh.

| Command | What it does |
|---|---|
| `pnpm dev` | Local database + dev server |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm db:generate` | Create a migration after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` (e.g. Neon) |
| `pnpm db:studio` | Browse the database in Drizzle Studio |

## Deploy (Vercel + Neon + R2)

1. Push this repo to GitHub and import it in Vercel.
2. Create a Neon database and run `DATABASE_URL=<neon url> pnpm db:migrate`.
3. Create a Cloudflare R2 bucket and an API token with read/write access to it.
4. In Vercel → Settings → Environment Variables, set everything in [.env.example](.env.example): `DATABASE_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (your Vercel URL), and the four `R2_*` values.

The app refuses to start on Vercel without a database and R2, rather than silently losing data.

## How it's built

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS, shadcn/ui |
| Database | Postgres via Drizzle ORM. Neon in production, PGlite locally |
| Auth | Better Auth: email/password, organizations (workspaces) with roles |
| Files | Cloudflare R2 (S3 API), local disk in development |
| CI | GitHub Actions: lint, typecheck, unit tests, migrations against real Postgres, build |

```
src/
├─ app/
│  ├─ page.tsx                     landing page
│  ├─ (auth)/sign-in, sign-up      account pages
│  ├─ onboarding/                  name your workspace
│  ├─ (app)/inbox/                 upload + invoice list (server action: actions.ts)
│  ├─ (app)/invoices/[id]/         invoice detail
│  └─ api/
│     ├─ auth/[...all]/            Better Auth endpoints
│     └─ invoices/[id]/file/       serves the original file, workspace members only
├─ db/schema.ts                    tables (auth tables in auth-schema.ts)
├─ lib/
│  ├─ session.ts                   requireOrg(): the one place auth + workspace are checked
│  ├─ storage.ts                   R2 or local disk
│  └─ files.ts                     type sniffing, size limits, hashing
└─ proxy.ts                        redirects signed-out visitors before rendering
```

### Decisions worth knowing about

- **Every business table has `org_id`, and every query filters by it.** `requireOrg()` in `src/lib/session.ts` is the only way pages and actions get an `orgId`, so it's hard to forget.
- **Money is stored as integer cents.** Floats can't represent $0.10 exactly.
- **Files are checked by their first bytes, not their extension.** A renamed `.exe` is rejected.
- **The same file can't be processed twice.** Uploads are hashed (SHA-256), and a unique index on `(org_id, file_hash)` backs up the check if two uploads race.
- **The local database runs as its own process.** Next.js uses several worker processes in development. If each opened the database files directly, they would corrupt them, so `scripts/dev.mjs` owns the files and the app connects over the normal Postgres protocol, exactly like production.
