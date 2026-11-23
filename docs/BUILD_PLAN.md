# Ledgerline — 8-Week Build Plan

> An AI accounts-payable assistant for small businesses. Forward an invoice → AI extracts it → matches it to POs → routes it for approval → exports it to accounting.

**Pace assumed:** ~15 hrs/week. Double it and you finish in 4 weeks; halve it and stretch to 16 — the order stays the same.

**The golden rule:** it's deployed from Week 1 and stays deployed. Every week ends with something you could show a recruiter.

---

## Tech stack (final picks)

| Layer | Choice | Why this one |
|---|---|---|
| App framework | **Next.js (App Router) + TypeScript** | Most-requested startup stack; one codebase for UI + API |
| UI | **Tailwind CSS + shadcn/ui** | Looks like a real product with little design work |
| Database | **Postgres on Neon** (free tier) in production; **PGlite** (local Postgres, no install) in development | Industry standard; `pnpm dev` works with zero accounts |
| ORM | **Drizzle** | Typed SQL, readable migrations |
| Auth | **Better Auth** (email/password + organization plugin) | Teams and roles built in, data lives in your own Postgres, runs locally with no account. *(Changed from Clerk during Week 1 setup.)* |
| File storage | **Cloudflare R2** (S3-compatible) | Cheap, S3 API knowledge transfers everywhere |
| AI | **Claude API** (`@anthropic-ai/sdk`), model `claude-opus-5-5` | Reads PDFs natively + structured outputs |
| Durable workflows | **Inngest** | Step functions with retries; works on Vercel; easier than Temporal for a first project |
| Inbound email | **Postmark** or **Resend** inbound webhooks | "Forward invoices to ap@yourco.ledgerline.app" |
| PDF viewer | **react-pdf** (pdf.js) | Show the invoice next to extracted fields |
| Fuzzy matching | **pg_trgm** (Postgres extension) | Duplicate + vendor-name matching without extra services |
| Testing | **Vitest** (unit), **Playwright** (end-to-end) | |
| CI | **GitHub Actions** | lint → typecheck → test → eval on every PR |
| Hosting / monitoring | **Vercel** + **Sentry** | |

---

## Repo structure

```
ledgerline/
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/page.tsx            # landing page
│  │  ├─ (app)/inbox/page.tsx            # all invoices + live status
│  │  ├─ (app)/invoices/[id]/page.tsx    # review screen: PDF left, fields right
│  │  ├─ (app)/approvals/page.tsx        # "waiting on me"
│  │  ├─ (app)/vendors/page.tsx
│  │  ├─ (app)/purchase-orders/page.tsx
│  │  ├─ (app)/settings/page.tsx         # approval rules, team, email address
│  │  └─ api/
│  │     ├─ inngest/route.ts             # workflow endpoint
│  │     ├─ webhooks/inbound-email/route.ts
│  │     ├─ upload/route.ts
│  │     └─ export/route.ts
│  ├─ db/
│  │  ├─ schema.ts                       # all tables (see Data model)
│  │  └─ index.ts
│  ├─ lib/
│  │  ├─ ai/
│  │  │  ├─ extract-invoice.ts           # the Claude call
│  │  │  ├─ invoice-schema.ts            # Zod schema = the contract with the model
│  │  │  └─ prompts/v1.ts, v2.ts ...     # versioned prompts (evals compare these)
│  │  ├─ matching/
│  │  │  ├─ three-way-match.ts
│  │  │  └─ duplicates.ts
│  │  ├─ approvals/rules-engine.ts
│  │  ├─ storage.ts                      # R2 upload + signed URLs
│  │  ├─ audit.ts                        # logAudit(orgId, actor, action, data)
│  │  └─ export/quickbooks-csv.ts
│  ├─ workflows/
│  │  ├─ client.ts
│  │  └─ process-invoice.ts              # the multi-step pipeline
│  └─ components/
├─ evals/
│  ├─ dataset/invoices/*.pdf
│  ├─ dataset/labels/*.json              # hand-checked "correct answers"
│  ├─ run-eval.ts                        # pnpm eval -- --prompt v2 --model ...
│  └─ results/                           # committed JSON per run → your proof
├─ tests/
│  ├─ unit/                              # matching, rules engine, money math
│  └─ e2e/                               # upload → review → approve → export
├─ drizzle/                              # generated migrations
├─ docs/
│  ├─ architecture.md                    # diagram + request flow
│  └─ decisions/0001-inngest-over-temporal.md ...
├─ .github/workflows/ci.yml
├─ .env.example
└─ README.md
```

---

## Data model (start small, grow weekly)

| Table | Key columns | Added in |
|---|---|---|
| `invoices` | id, org_id, status, file_key, file_hash, vendor_id, invoice_number, invoice_date, due_date, subtotal_cents, tax_cents, total_cents, currency, source (`upload`/`email`) | Week 1 |
| `invoice_fields` | invoice_id, field_name, value, confidence (0–1), page, source_text, corrected_value, corrected_by | Week 2 |
| `invoice_line_items` | invoice_id, description, qty, unit_price_cents, amount_cents, po_line_id | Week 2 |
| `extraction_runs` | invoice_id, model, prompt_version, input_tokens, output_tokens, cost_cents, latency_ms, status | Week 2 |
| `vendors` | org_id, name, aliases[], tax_id, default_gl_account | Week 5 |
| `purchase_orders` / `po_lines` | org_id, vendor_id, po_number, line items, qty_ordered | Week 5 |
| `receipts` | po_line_id, qty_received, received_at | Week 5 |
| `approval_rules` | org_id, min_amount_cents, vendor_id?, approver_role, step_order | Week 6 |
| `approvals` | invoice_id, step, approver_id, decision, comment, decided_at | Week 6 |
| `audit_events` | org_id, actor_id, invoice_id, action, before, after, created_at | Week 6 |

**Invoice status machine** (draw this in `docs/architecture.md` — interviewers love it):

```
received → extracting → needs_review → matching → pending_approval → approved → exported
                 ↘ failed (retryable)          ↘ mismatch (needs_review)   ↘ rejected
```

Store money as **integer cents**, never floats. You will be asked about this.

---

## Week 0 — Setup (2–3 hours)

Node and pnpm are installed. The rest needs your own accounts.

- [x] Install Node LTS (done: Node 26 in `~/.local/node`) and pnpm
- [x] Create GitHub repo `ledgerline`, push an empty README
- [ ] Create free accounts: Vercel, Neon, Cloudflare (R2), Inngest, Sentry, Anthropic Console (add ~$10 credit — enough for the whole project)
- [ ] Write a one-paragraph problem statement in the README *before* any code. This becomes your pitch.

---

## Week 1 — Skeleton that's live on the internet

**Goal:** sign in, upload a PDF, see it in a list. Deployed.

- [x] Next.js 16 app (TypeScript, Tailwind, App Router, `src/`) + shadcn/ui
- [x] Better Auth with **organizations** (sign up → name your workspace; every row gets an `org_id` from day one)
- [x] Drizzle + Postgres, `invoices` table, first migration (local PGlite in dev; Neon once you add `DATABASE_URL`)
- [x] Upload: PDF/image → storage (local disk in dev, R2 when configured), SHA-256 `file_hash`, duplicate check, invoice row with status `received`
- [x] Inbox page: table of invoices with status badges
- [x] Deploy to Vercel; connect GitHub so every push deploys
- [x] GitHub Actions: lint + typecheck + unit tests + migrations + build on every PR

**Done when:** a friend can open your URL, sign up, and upload a PDF.
**Learn this week:** Next.js server actions vs route handlers; what multi-tenancy means.

---

## Week 2 — AI extraction v1 + the review screen

**Goal:** upload an invoice → structured fields appear in ~10 seconds, and a human can fix them.

- [x] Define `invoice-schema.ts` with Zod: vendor name, invoice #, dates, totals, line items. For **each field** also ask for `confidence` (0–1), `page`, and `source_text` (the exact text it read)
- [x] `extract-invoice.ts`: send the PDF as a `document` block to Claude and get typed JSON back via **structured outputs** (`client.messages.parse()` / `output_config.format`). Read `stop_reason` before trusting the result
- [x] Log every call to `extraction_runs` (tokens, cost, latency, prompt version) — this table feeds your resume numbers
- [x] Validate after the model: does `sum(line items) + tax == total`? If not, drop confidence and flag it. *Never trust the model blindly — show this in interviews.*
- [x] Review page: PDF on the left (react-pdf), editable fields on the right. Fields under 0.8 confidence are highlighted yellow. Clicking a field highlights its `source_text` on the PDF (search the pdf.js text layer)
- [x] Save human corrections to `corrected_value` (this becomes free eval data later)

**Done when:** you upload 5 different real-looking invoices and the review screen is useful on all of them.
**Learn this week:** structured outputs, Zod, why LLM output must be validated.

---

## Week 3 — Build the eval harness (do this early — it's your best differentiator)

**Goal:** one command tells you how accurate extraction is, and you can prove a change made it better.

- [ ] Collect **50 invoices** of varied formats: generate some yourself (different templates, scanned/skewed images, multi-page, foreign currency), use public sample-invoice datasets, and — with permission and redaction — real ones from a local business
- [ ] Hand-label each one into `evals/dataset/labels/<name>.json`
- [ ] `run-eval.ts`: runs extraction on every invoice, compares to labels (exact match for numbers/dates, normalized match for names), prints a per-field accuracy table, writes `evals/results/<date>-<prompt>-<model>.json`
- [ ] Run v1 → write down the baseline. Change the prompt → v2 → compare. Keep the winner.
- [ ] Also run a cheaper model (`claude-haiku-5-5`) through the same eval: compare **accuracy vs. cost per invoice**. A table like "Haiku: 91% at $0.002 · Opus: 96% at $0.015" is a fantastic interview story about tradeoffs
- [ ] Add the eval to CI (on a small 10-invoice subset to keep it cheap) so a prompt change can't silently get worse

**Done when:** `pnpm eval` prints an accuracy table and the README shows it.
**Learn this week:** precision vs. accuracy, test sets, why "it worked on my 3 examples" isn't evidence.

---

## Week 4 — The durable multi-step pipeline + email intake

**Goal:** invoices flow through the pipeline on their own and survive failures.

- [ ] Move processing into an Inngest function `process-invoice` with named steps: `extract` → `validate` → `match` → `route-for-approval`. Each step retries independently
- [ ] **Idempotency:** use `file_hash` + `org_id` as the event ID, so the same invoice emailed twice is only processed once
- [ ] Update `invoices.status` at each step; UI shows live progress (polling every 2s is fine — SSE is a stretch)
- [ ] Inbound email webhook: verify the webhook signature, pull attachments, create invoices, fire the event
- [ ] Failure test: throw an error inside `match` on purpose, watch it retry and then resume from that step without re-calling the AI. Screenshot the Inngest dashboard for your README

**Done when:** you forward an email with 2 invoices attached and both reach `needs_review` or `pending_approval` without you touching anything.
**Learn this week:** idempotency, retries with backoff, webhooks, why long jobs don't belong in a web request.

---

## Week 5 — Three-way matching + duplicate detection

**Goal:** the app catches the mistakes that cost businesses real money.

- [ ] Vendors, POs and receipts pages + CSV import + a seed script with realistic demo data
- [ ] Vendor resolution: match the extracted vendor name to an existing vendor (exact → alias → `pg_trgm` similarity), else suggest creating one
- [ ] `three-way-match.ts`: invoice line vs. PO line (price) vs. receipt (quantity received), with tolerances (e.g. ±2% price). Output a list of mismatches with plain-English reasons: *"Billed for 120 units but only 100 were received."*
- [ ] `duplicates.ts`: exact (same vendor + invoice # ) and fuzzy (same vendor, total within 1%, date within 7 days, `pg_trgm` on invoice #) → flag as "possible duplicate of INV-1042"
- [ ] **Heavy unit tests here** — this is pure logic, easy to test, and money logic is where interviewers poke

**Done when:** your seed data includes 3 planted problems (an overbilling, a short shipment, a duplicate) and the app catches all three.
**Learn this week:** writing testable pure functions, Postgres extensions, how accounts payable actually works (read 1–2 articles on "three-way match").

---

## Week 6 — Approvals, roles, audit log

**Goal:** it behaves like software a real company could trust.

- [ ] Roles: `owner`, `approver`, `clerk` (via Better Auth organization roles); check permissions on the **server**, not just by hiding buttons
- [ ] Rules engine: ordered rules like "over $5,000 → owner approval", "vendor X → always needs approval", "under $500 and matched → auto-approve"
- [ ] Multi-step approvals: the invoice waits in Inngest (`step.waitForEvent`) until each approver acts. Email approvers a link
- [ ] `audit_events` for every change (who, what, before/after, when) + a timeline on the invoice page
- [ ] Tenant isolation check: write a test that user A can never read org B's invoice

**Done when:** a $6,000 invoice goes clerk → approver → owner, and the timeline shows every step.
**Learn this week:** authorization vs. authentication, event-driven waits, audit trails.

---

## Week 7 — Export, polish, and a real user

**Goal:** someone who isn't you finds it useful.

- [ ] Export approved invoices as a QuickBooks-importable CSV (stretch: QuickBooks Online API sandbox)
- [ ] Landing page with a clear headline, 3 benefits, screenshot, "Try the demo" button that loads sample data into a demo org
- [ ] Empty states, loading states, error messages that say what to do next
- [ ] Guardrails: upload size/type limits, per-org rate limit, daily AI spend cap
- [ ] Sentry wired up
- [ ] **Find one real user** (a bookkeeper, a small business owner, a friend's family business). Watch them use it for 20 minutes without helping. Fix the top 3 things they struggled with

**Done when:** one person outside your circle has processed real invoices and you have a quote from them.

---

## Week 8 — Tell the story

**Goal:** a recruiter understands it in 30 seconds; an engineer is impressed in 5 minutes.

- [ ] Playwright end-to-end test of the main path (upload → review → approve → export) running in CI
- [ ] README: problem → 20-second GIF → live link → architecture diagram → **eval results table** → key decisions → how to run it locally
- [ ] 2–4 short decision records in `docs/decisions/` (Inngest vs Temporal, cents vs floats, pg_trgm vs embeddings, which model and why)
- [ ] 90-second demo video (Loom)
- [ ] Write resume bullets **using only numbers from your `extraction_runs` table and eval results**
- [ ] LinkedIn post: the problem, one surprising thing you learned, the link

---

## If you fall behind, cut in this order

1. QuickBooks API (keep the CSV)
2. Inbound email (keep uploads)
3. Multi-step approvals (keep single approval)
4. Live status updates (refresh the page)

**Never cut:** the eval harness, the review screen, deployment, tests on matching logic. Those are what make this project stand out.

---

## Questions you'll be asked in interviews — prepare answers as you build

- What happens when the AI is wrong? *(confidence scores, totals validation, human review queue, evals)*
- How do you know your prompt change helped? *(eval set, before/after table)*
- What does one invoice cost to process, and how would you make it cheaper? *(extraction_runs data, model comparison)*
- What if the same invoice arrives twice? *(idempotency key + duplicate detection — two different layers)*
- What if a step fails halfway? *(Inngest step retries, resumes without re-running finished steps)*
- How do you keep one company's data away from another? *(org_id on every query + the isolation test)*
- Why store money as cents?

---

## Resume bullets (template — fill in your real numbers)

> **Ledgerline** — AI accounts-payable automation · Next.js, TypeScript, Postgres, Claude API, Inngest · [live] · [GitHub]
> - Built an AI invoice-extraction pipeline reaching **__%** field-level accuracy on a **__**-invoice hand-labeled eval set; prompt iteration improved accuracy from **__%** to **__%**, measured in CI on every change.
> - Designed a durable multi-step workflow (extract → validate → match → approve) with per-step retries and idempotent processing, so duplicate emails and mid-pipeline failures never double-process an invoice.
> - Implemented three-way PO/receipt matching and fuzzy duplicate detection that caught **__** billing errors in pilot use with a local bookkeeper, cutting time per invoice from **~__ min** to **~__ sec**.
