# 🏗️ Architecture Review — Enable Banking & Reconciliation
> Status: `[ ] Draft` → `[ ] Reviewed` → `[x] Locked`
> Feature: Invoice Reconciliation & Banking Integration (PRD v2.0)

---

## 1. Existing Architecture — Snapshot

### Tech Stack
| Layer | Current Choice | Version | Notes |
|---|---|---|---|
| Language | TypeScript | ^5 | |
| Framework | Next.js | ^15.2.4 | App Router, server actions + API routes |
| Database | PostgreSQL hosted on Supabase | — | Connected via Prisma (`DATABASE_URL`). No Supabase JS client, no RLS, no Supabase Auth. |
| ORM | Prisma | ^6.6.0 | Schema at `/prisma/schema.prisma`, client at `/lib/db.ts` |
| Auth | better-auth | ^1.2.10 | Email OTP via Resend. NOT Supabase Auth. |
| File Storage | Local filesystem | — | `UPLOAD_PATH` env var, organised by user/date |
| Hosting (frontend) | Vercel | — | |
| Hosting (backend) | — | — | **No separate backend. Everything is Next.js.** |
| Testing | — | — | No test framework currently configured |

### System Overview
```
Browser (React)
  ↓ FormData / fetch
Next.js Server Actions ("use server")   ←→   Next.js API Routes (/app/api/)
  ↓                                              ↓
Model layer (/models/*.ts)              Webhook handlers, SSE, Stripe
  ↓
Prisma Client (/lib/db.ts)
  ↓
PostgreSQL
  +
Local Filesystem (uploads/)
```

### Key Existing Modules
| Module | Responsibility | Location |
|---|---|---|
| DB client | Prisma singleton | `/lib/db.ts` |
| Auth | better-auth setup, `getCurrentUser()`, `getSession()` | `/lib/auth.ts` |
| Transaction model | CRUD, filtering, search | `/models/transactions.ts` |
| File model | Upload, retrieve, delete | `/models/files.ts`, `/lib/uploads.ts` |
| Server actions | All user-initiated mutations | `/app/**/actions.ts` |
| Stripe webhook | Payment events | `/app/api/stripe/webhook/route.ts` |
| Progress SSE | Long-running operation tracking | `/app/api/progress/[progressId]/route.ts` |

---

## 2. PRD vs Reality — Tensions Resolved

> The PRD was drafted assuming FastAPI + Supabase. The actual stack is different. Decisions below.

| PRD Assumption | Reality | Decision |
|---|---|---|
| FastAPI backend on Railway handles all `/api/banking/*` routes | No separate backend. Everything is Next.js. | Enable Banking API calls made from Next.js API routes and server actions. No FastAPI needed. |
| Supabase Auth JWT on every request | better-auth with its own session/JWT. `getCurrentUser()` is the auth primitive. | Replace all "Supabase JWT" references with `getCurrentUser()` from `/lib/auth.ts`. Same security, different implementation. |
| Supabase RLS for row-level security | No RLS. Prisma queries scope by `userId` directly. | All new queries include `WHERE userId = currentUser.id`. Matches existing pattern across all models. |
| `bank_connections` and `bank_transactions` added via Supabase migration | Prisma manages schema. Migrations via `prisma migrate`. | New tables added to `/prisma/schema.prisma` + `prisma migrate dev`. |
| Enable Banking webhook at `/api/webhooks/enable-banking` | Next.js API routes live at `/app/api/` | Webhook at `/app/api/banking/webhook/route.ts` |

---

## 3. What Changes

### New tables (Prisma schema)
- [ ] `BankConnection` model — OAuth session + account metadata per user
- [ ] `BankTransaction` model — imported bank trades, unique on `(accountUid, externalId)`
- [ ] `BankTransactionMatch` model — join table with `status`, `matchType`, `confidenceScore`

### New API routes
- [ ] `POST /app/api/banking/webhook/route.ts` — Enable Banking webhook receiver (HMAC-SHA256)

### New server actions
- [ ] `/app/(app)/banking/actions.ts` — connect, sessions, sync, disconnect, match, unmatch, export

### New model layer
- [ ] `/models/banking.ts` — all DB queries for `BankConnection`, `BankTransaction`, `BankTransactionMatch`

### New frontend pages
- [ ] `/app/(app)/banking/` — connections list, bank transactions view
- [ ] `/app/(app)/banking/callback/` — OAuth callback page

### New packages required
| Package | Purpose | Approved? |
|---|---|---|
| `jose` or `jsonwebtoken` | RS256 JWT signing for Enable Banking auth | [ ] |
| `xlsx` | Excel export (.xlsx) | [ ] |

> **Note:** HTTP calls to Enable Banking API are made via native `fetch` (already available in Next.js). No additional HTTP client needed.

### Existing code touched
| File | Why |
|---|---|
| `/prisma/schema.prisma` | Add 3 new models |
| `components/sidebar/sidebar.tsx` | Add Banking nav item (already modified per git status) |

---

## 4. Data Model — New Additions

### BankConnection
```prisma
model BankConnection {
  id              String    @id @default(uuid())
  userId          String
  sessionId       String
  accountUid      String    @unique
  accountIban     String?
  accountName     String?
  institutionName String?
  lastSynced      DateTime?
  createdAt       DateTime  @default(now())

  user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  bankTransactions  BankTransaction[]

  @@index([userId])
}
```

### BankTransaction
```prisma
model BankTransaction {
  id              String   @id @default(uuid())
  userId          String
  accountUid      String
  externalId      String
  idempotencyKey  String   @unique
  date            DateTime
  amount          Decimal
  currency        String   @default("EUR")
  description     String?
  institutionName String?
  rawData         Json?
  createdAt       DateTime @default(now())

  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  connection  BankConnection  @relation(fields: [accountUid], references: [accountUid])
  match       BankTransactionMatch?

  @@unique([accountUid, externalId])
  @@index([userId])
  @@index([accountUid])
}
```

### BankTransactionMatch
```prisma
model BankTransactionMatch {
  id                String    @id @default(uuid())
  bankTransactionId String    @unique
  transactionId     String?
  fileId            String?
  matchType         String    // 'exact' | 'strong' | 'fuzzy' | 'partial' | 'manual'
  confidenceScore   Int
  status            String    // 'suggested' | 'confirmed' | 'rejected'
  suggestedAt       DateTime  @default(now())
  actionedAt        DateTime?
  actionedBy        String?

  bankTransaction BankTransaction @relation(fields: [bankTransactionId], references: [id], onDelete: Cascade)

  @@index([bankTransactionId])
  @@index([status])
}
```

> **One confirmed match per BankTransaction** enforced at application layer (check before insert) since Prisma doesn't support partial unique indexes natively. Raw SQL migration adds the partial index after schema creation.

---

## 5. Integration Seams — Enable Banking

| Dependency | Format contract | Known edge cases | Validation before coding |
|---|---|---|---|
| Enable Banking API auth | RS256 JWT, fresh per request, `kid = APP_ID`, 1hr expiry. Private key: base64 body only in env — reconstruct PEM with 64-char line wrapping at runtime | Railway strips newlines from env vars — key must be stored without headers and reconstructed | After adding key to Railway (or `.env`), decode the generated JWT at jwt.io and verify `kid`, `iss`, `aud`, `exp` |
| `GET /aspsps` | Returns `[{name, country}]`. Names are API-owned — never hardcode | Wrong name → `422 WRONG_ASPSP_PROVIDED` | Call the endpoint with `country=FR`, log first 5 results, verify name format matches what `POST /auth` expects |
| `POST /auth` | `redirect_url` must match portal registration byte-for-byte | Trailing slash, http vs https, or wrong Vercel URL → silent OAuth failure | Register callback URL in portal first, copy exact string into `FRONTEND_URL`, verify they match character-by-character |
| `POST /sessions` | Returns `session_id` + accounts array with `account_uid`, `iban`, `name` | `account_uid` is the stable key — `session_id` may change on reconnect | Log full response on first connect, verify `account_uid` persists across reconnects |
| Transaction pagination | `continuation_key` in response — absent means last page | Revolut FX trades: two transactions share same `transaction_id` across accounts → dedup must be `(accountUid, externalId)` not just `externalId` | Test with an account that has > 1 page of transactions, verify all pages fetched |
| Webhook HMAC | Verified on **raw bytes** before JSON parsing. `hmac(secret, raw_body, sha256)` | `json.dumps` default separators must match exactly how Enable Banking serialises — compact separators differ | Send a test webhook from the portal, verify our HMAC matches before processing |

---

## 6. Non-Functional Conflicts

| NFR / Constraint | Conflict? | Resolution |
|---|---|---|
| PRD: Supabase RLS | ⚠️ Partial | No RLS in this stack. Prisma `userId` scoping achieves same result. All queries include `WHERE userId = currentUser.id`. |
| PRD: FastAPI on Railway | ❌ Not applicable | All logic runs in Next.js. No Railway backend. |
| PRD: `python3 scripts/git_ops.py` | ❌ Not applicable | No such script exists in this project. Use raw git commands. |
| Existing transactions table READ ONLY | ✅ None | Prisma models are additive. New models don't touch `Transaction`. |
| No test framework | ⚠️ Gap | Testing strategy: mock `fetch` in Jest/Vitest for Enable Banking HTTP calls. Real bank used for manual smoke testing only. Test framework setup is first task of Phase 0. |

---

## 7. Key Technical Decisions

| Decision | Options Considered | Choice | Rationale |
|---|---|---|---|
| Enable Banking API calls location | Server actions vs API routes | **API routes** (`/app/api/banking/`) for external API calls; server actions for DB mutations only | External HTTP calls with long timeouts don't belong in server actions. API routes give cleaner error handling and are required for the webhook anyway. |
| JWT signing library | `jsonwebtoken`, `jose` | **`jose`** | Web Crypto API compatible, works in Next.js edge/serverless. `jsonwebtoken` requires Node crypto which can cause issues in some Next.js runtimes. |
| Partial unique index (one confirmed match) | Prisma unique constraint vs raw SQL | **Raw SQL in migration** | Prisma doesn't support `WHERE` clauses on unique indexes. Add via a raw SQL migration after `prisma migrate`. |
| Excel export | `xlsx`, `exceljs` | **`xlsx`** | Lighter, widely used, sufficient for flat tabular export. |
| Matching engine location | Server action vs background job | **Server action triggered post-sync** | No background job infrastructure exists. Run scoring synchronously after sync completes. For large accounts, use existing progress tracking SSE pattern. |
| Testing | Real bank vs mocked HTTP | **Mock `fetch` for unit/integration tests; real bank for manual smoke testing** | Deterministic, free, no rate-limit risk. Real bank confirms end-to-end OAuth + data shape only. |

---

## 8. Platform-Specific Gotchas

### Vercel
- **Preview deployments have a different URL** — `NEXT_PUBLIC_APP_URL` must be set per environment. The Enable Banking OAuth callback URL registered in the portal must match the **production** Vercel URL. Preview deploys cannot test the full OAuth flow without separate portal registration.
- **`NEXT_PUBLIC_` prefix** required for any env var used in client components (e.g. the callback URL displayed to the user).
- **Serverless function timeout** — default 10s on hobby plan. Sync for large accounts (many pages) may timeout. Use streaming response or break into account-level jobs if needed.

### Railway (private key)
- Not applicable — no Railway backend in this project. Private key lives in Vercel env vars instead.
- **Same newline stripping applies to Vercel** — store base64 body only, reconstruct PEM at runtime.

### Prisma
- **Migrations are append-only** — never edit a migration that has already run. Always `prisma migrate dev --name description`.
- **Partial unique index** not supported in schema — add via raw SQL in a separate migration after the model migration.
- **`onDelete: Cascade`** on `userId` FK — if user deletes account, all bank data goes with it. Intentional.

---

## 9. Known Limitations Introduced by This Feature
- [ ] Matching engine runs synchronously post-sync — may be slow for accounts with thousands of transactions. Acceptable for v1; background jobs in v2.
- [ ] One confirmed match per Bank Transaction is enforced at application layer, not purely at DB layer (partial index is advisory, not a hard constraint via Prisma). Risk: concurrent requests could theoretically create two confirmed matches. Mitigate by checking before insert in the model layer.
- [ ] No test framework currently in project — must be set up as first task of Phase 0.

---

## 📤 Outputs for 5-EPICS.md

- **Phase 0 (DB Schema)** → Epic 1: 3 new Prisma models + partial unique index migration + test framework setup
- **Phase 1 (Auth + Connect)** → Epic 2: `jose` JWT generation, ASPSP route, OAuth connect + sessions routes, re-auth route
- **Phase 2 (Sync)** → Epic 3: sync route, pagination, amount sign, external_id resolution, idempotent insert
- **Phase 3 (Webhook)** → Epic 4: webhook API route, HMAC verification, trigger sync on valid event
- **Phase 4 (UI)** → Epic 5: bank transactions list page, connections page, OAuth callback page, sidebar nav
- **Phase 5 (Matching Engine)** → Epic 6: scoring engine, auto-confirm score 100, suggestion UI, accept/reject flows
- **Phase 6 (Export)** → Epic 7: CSV + Excel export endpoint
- **Phase 7 (Hardening)** → Epic 8: session expiry detection, audit log, observability, error handling polish
