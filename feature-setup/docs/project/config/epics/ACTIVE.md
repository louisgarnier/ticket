# ACTIVE — Enable Banking & Reconciliation
> One story at a time. Stop after each. Wait for "go".
> Key principle: every story ends with something visible and testable in the browser.
> Auth: `getCurrentUser()` from `/lib/auth.ts` — never Supabase Auth
> DB: Prisma + PostgreSQL (Supabase-hosted) — no Supabase JS client, no RLS
> API: Next.js API routes under `/app/api/banking/` — no Railway/FastAPI

---

## EPIC-1: Foundation

### Story 1.1 — DB Migrations ✅ DONE
**Goal:** 3 new Prisma models deployed, partial unique index in place.
**Acceptance Criteria:**
- [x] `BankConnection`, `BankTransaction`, `BankTransactionMatch` models added to `/prisma/schema.prisma`
- [x] Migration runs cleanly: `prisma migrate dev --name enable-banking-foundation`
- [x] Partial unique index on `bankTransactionMatches(bankTransactionId) WHERE status = 'confirmed'` added via raw SQL in a second migration
- [x] Basic model layer at `/models/banking.ts`: createBankConnection, getBankConnections, createBankTransactionsBulk, getBankTransactions, createBankTransactionMatch

---

### Story 1.2 — Test Framework + Mock Pattern ✅ DONE
**Goal:** Tests run. Enable Banking HTTP calls are mocked. Pattern established for all future stories.
**Acceptance Criteria:**
- [x] Vitest configured
- [x] `mockEnableBanking` fetch helper at `/tests/banking/mock-enable-banking.ts`
- [x] One passing test: mock `GET /aspsps`, assert `[{name, country}]` shape

---

### Story 1.3 — Banking Scaffold ✅ DONE
**Goal:** Banking nav item and placeholder pages exist. First visible sign of the feature.
**Browser test:** ✅ Click "Banking" in sidebar → see page with "No bank accounts connected yet" empty state.
**Acceptance Criteria:**
- [x] "Banking" nav item in sidebar (Landmark icon, after Unsorted)
- [x] `/banking` page renders with heading + empty state
- [x] `/banking/callback` page renders "Processing your bank connection..." placeholder
- [x] Both pages are auth-protected via `(app)` layout

---

## EPIC-2: Connect Your Bank

### Story 2.1 — JWT Auth + ASPSP Discovery
**Goal:** App generates valid RS256 JWTs and fetches bank lists from Enable Banking.
**Browser test:** `GET /api/banking/aspsps?country=FR` returns a list of French banks.
**Acceptance Criteria:**
- [ ] `_makeJwt()` generates valid RS256 JWT (`iss`, `aud`, `iat`, `exp`, `kid` correct)
- [ ] PEM reconstruction works for base64-only key (Vercel env var format) and full PEM
- [ ] `GET /api/banking/aspsps?country=XX` returns `[{name, country}]`
- [ ] Returns 401 if not authenticated
- [ ] Private key never logged

**Tasks:**
- [ ] Install `jose`
- [ ] Create `/lib/enable-banking.ts` — `_makeJwt()`, `_authHeaders()`, `getAspsps(country)`
- [ ] Create `/app/api/banking/aspsps/route.ts`
- [ ] Add env vars to `.env.example`: `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY`, `ENABLE_BANKING_BASE_URL`

**Dev Tests:**
- [ ] Decode JWT → assert `iss`, `aud`, `kid`, `exp - iat == 3600`
- [ ] Base64-only key → valid JWT
- [ ] Newline-escaped key (`\n`) → reconstructed correctly
- [ ] Mock ASPSP endpoint → correct shape
- [ ] Unauthenticated → 401

---

### Story 2.2 — Connect Flow UI (VISIBLE)
**Goal:** User picks country, picks bank, clicks Connect, gets redirected to bank OAuth page.
**Browser test:** /banking → select France → select bank → click Connect → redirected to bank login.
**Acceptance Criteria:**
- [ ] Country dropdown on banking page
- [ ] Bank dropdown populates from ASPSP endpoint on country select
- [ ] Connect button calls `POST /api/banking/connect` → redirects to returned auth URL
- [ ] Bank names always from API — never hardcoded
- [ ] Loading state while fetching banks
- [ ] `422 WRONG_ASPSP_PROVIDED` → user-friendly error

**Tasks:**
- [ ] Create `/app/api/banking/connect/route.ts` — calls Enable Banking `POST /auth`
- [ ] Build ASPSP picker component (country selector → bank dropdown → Connect button)
- [ ] Add to `/app/(app)/banking/page.tsx`

**Dev Tests:**
- [ ] Mock `POST /auth` → correct payload, auth URL returned
- [ ] Mock 422 → user-friendly error shown

---

### Story 2.3 — OAuth Callback + Connections List (VISIBLE)
**Goal:** After bank authorises, connection stored and visible with Sync + Disconnect actions.
**Browser test:** Complete OAuth → /banking shows connected account with IBAN, institution, Sync + Disconnect buttons.
**Acceptance Criteria:**
- [ ] `/banking/callback` reads `code` from URL, calls `POST /api/banking/sessions`
- [ ] Accounts upserted into `bank_connections` on `accountUid` conflict — never delete on reconnect
- [ ] Success → redirect to `/banking` with connected account visible
- [ ] Connected accounts list: institution name, masked IBAN, lastSynced, Sync button, Disconnect button
- [ ] Disconnect removes `bank_connections` row, preserves `bank_transactions`

**Tasks:**
- [ ] Create `/app/api/banking/sessions/route.ts`
- [ ] Update `/app/(app)/banking/callback/page.tsx`
- [ ] Update `/app/(app)/banking/page.tsx` — connected accounts list
- [ ] Create `/app/api/banking/connections/[accountUid]/route.ts` — DELETE

**Dev Tests:**
- [ ] Mock `POST /sessions` → accounts stored, upsert works on reconnect
- [ ] Missing code param → error shown
- [ ] Disconnect → row removed, `bank_transactions` preserved

---

### Story 2.4 — Session Expiry Detection (VISIBLE)
**Goal:** Clear in-app banner when bank connection is about to expire or has expired.
**Browser test:** Manually set connection `createdAt` to 84+ days ago → visit /banking → see expiry warning banner with Reconnect button.
**Acceptance Criteria:**
- [ ] App detects session within 7 days of 90-day expiry or already expired
- [ ] Banner shown: "Your bank connection expires in X days — click to reconnect" or "has expired"
- [ ] Reconnect button → `POST /api/banking/reauth` → re-runs OAuth, upserts connection, preserves all data
- [ ] Sync resumes from `lastSynced` after re-auth

**Tasks:**
- [ ] Add expiry detection logic to banking page (compute from `createdAt` + 90 days)
- [ ] Build expiry banner component
- [ ] Create `/app/api/banking/reauth/route.ts`

---

## EPIC-3: Sync Transactions

### Story 3.1 — Sync Endpoint
**Goal:** Clicking Sync pulls all transactions from Enable Banking into the DB.
**Browser test:** Click Sync → loading indicator → "Synced 47 transactions" toast.
**Acceptance Criteria:**
- [ ] `POST /api/banking/sync` syncs full (90 days) or incremental (from `lastSynced`)
- [ ] All pages fetched via `continuationKey` — no truncation
- [ ] DBIT → negative amount; all others → positive
- [ ] `externalId` resolution: `transaction_id` → `entry_reference` → `internal_transaction_id`
- [ ] Duplicates silently absorbed by unique constraint
- [ ] `lastSynced` updated only on full success
- [ ] Sync button on connections list shows loading state + result toast

**Tasks:**
- [ ] Add `fetchTransactions(accountUid, dateFrom)` to `/lib/enable-banking.ts`
- [ ] Create `/app/api/banking/sync/route.ts`
- [ ] Add `createBankTransactionsBulk()` to `/models/banking.ts`
- [ ] Wire Sync button on connections list

**Dev Tests:**
- [ ] Single page → transactions stored, `lastSynced` updated
- [ ] Multi-page via `continuationKey` → all pages fetched
- [ ] DBIT → negative; CRDT → positive
- [ ] Duplicate sync → no duplicates
- [ ] Mid-pagination failure → `lastSynced` not updated

---

### Story 3.2 — Bank Transactions List (VISIBLE)
**Goal:** Synced transactions visible in a dedicated list, clearly separate from invoice transactions.
**Browser test:** After sync → /banking/transactions shows list with amounts (coloured), dates, descriptions, match status badges. Filter works.
**Acceptance Criteria:**
- [ ] `/banking/transactions` shows paginated list: date, amount (red/green), currency, description, institution, match status badge
- [ ] Filter: All / Matched / Unmatched
- [ ] Empty state when no transactions synced
- [ ] Link from connections page to transactions page
- [ ] Invoice transactions (`/transactions` page) completely unaffected

**Tasks:**
- [ ] Create `/app/api/banking/transactions/route.ts` — GET with filter params
- [ ] Create `/app/(app)/banking/transactions/page.tsx`
- [ ] Add link from `/banking` to `/banking/transactions`

**Dev Tests:**
- [ ] Matched filter → only matched transactions returned
- [ ] Unmatched filter → only unmatched returned
- [ ] Existing `/transactions` page unaffected

---

## EPIC-4: Matching Engine

### Story 4.1 — Scoring Engine + Suggestion Badges (VISIBLE)
**Goal:** After sync, bank transactions are scored and suggestion badges appear in the list.
**Browser test:** After sync → transaction list shows "1 suggestion" / "Auto-matched" badges.
**Acceptance Criteria:**
- [ ] Scoring runs after every successful sync and on every new invoice transaction save
- [ ] Exact (100): reference + amount + currency → auto-confirmed, labelled "Auto-matched"
- [ ] Strong (85): amount + currency + date ±3 days → suggested
- [ ] Fuzzy (60-80): amount within tolerance + description similarity ≥ 80% → suggested
- [ ] Partial (variable): amount fraction + reference hint → suggested, flagged partial
- [ ] Score < 60 → no suggestion, goes to manual review queue
- [ ] Max 5 suggestions per bank transaction
- [ ] Suggestion count badges visible on transactions list

**Tasks:**
- [ ] Create `/lib/matching-engine.ts` with all scoring rules
- [ ] Wire to sync endpoint: run engine after insert
- [ ] Wire to invoice transaction save in `/app/(app)/transactions/actions.ts`
- [ ] Add suggestion count badge to bank transactions list

**Dev Tests:**
- [ ] Exact match → auto-confirmed
- [ ] Strong match → suggested score 85
- [ ] Amount outside tolerance → no fuzzy match
- [ ] Description similarity < 80% → no match
- [ ] Score 100 → only one confirmed match enforced

---

### Story 4.2 — Accept / Reject + Manual Match (VISIBLE)
**Goal:** User reviews suggestions and confirms/rejects, or manually searches for a match.
**Browser test:** Click bank transaction with suggestions → ranked cards → Accept → "Matched". Reject all → search manually → link to invoice.
**Acceptance Criteria:**
- [ ] Detail panel shows ranked suggestions: confidence score, match type, matched record details, Accept/Reject buttons
- [ ] Accept → confirmed, all other suggestions for same transaction auto-rejected
- [ ] Reject → archived, next suggestion shown
- [ ] Auto-matched records labelled "Auto-matched" with Unmatch button
- [ ] All suggestions rejected → manual search UI (invoice search + unsorted file browser)
- [ ] Manual match: `matchType = 'manual'`, `confidenceScore = 100`, `status = 'confirmed'`
- [ ] All actions written to audit log

**Tasks:**
- [ ] Create `/app/api/banking/matches/confirm/[matchId]/route.ts`
- [ ] Create `/app/api/banking/matches/reject/[matchId]/route.ts`
- [ ] Create `/app/api/banking/matches/route.ts` (POST — manual match)
- [ ] Create `/app/api/banking/matches/[matchId]/route.ts` (DELETE — unmatch)
- [ ] Build suggestion detail panel component
- [ ] Build manual match search UI (invoice search + unsorted file browser)

**Dev Tests:**
- [ ] Confirm → other suggestions auto-rejected
- [ ] Reject → others preserved
- [ ] Unmatch → returns to unmatched, rejections restored to suggested
- [ ] Duplicate confirm → 409

---

## EPIC-5: Export

### Story 5.1 — CSV + Excel Export (VISIBLE)
**Goal:** Export button downloads bank transactions with match details.
**Browser test:** Click Export → pick format → file downloads with correct columns and filename.
**Acceptance Criteria:**
- [ ] Export button on bank transactions page with date range, account, status filters
- [ ] CSV and Excel (.xlsx) formats
- [ ] Columns: date, amount, currency, description, institution, match_status, match_type, confidence_score, matched_invoice_description, matched_invoice_amount, matched_invoice_category, matched_file_name
- [ ] Filename: `bank_transactions_{account}_{date_from}_{date_to}.{ext}`

**Tasks:**
- [ ] Install `xlsx`
- [ ] Create `/app/api/banking/export/route.ts`
- [ ] Add Export button + filter UI to transactions page

**Dev Tests:**
- [ ] CSV export → correct columns and row count
- [ ] Excel export → valid `.xlsx`
- [ ] Date range filter → correct rows only
- [ ] Matched-only filter → correct rows only

---

## EPIC-6: Hardening

### Story 6.1 — Webhook Receiver
**Goal:** Enable Banking pushes new transactions automatically without user triggering sync.
**Browser test:** Send test webhook from Enable Banking portal → transaction appears in list within seconds.
**Acceptance Criteria:**
- [ ] `POST /api/banking/webhook` verifies HMAC-SHA256 on raw bytes before JSON parsing
- [ ] Invalid signature → 401, attempt logged (timestamp + IP, no body)
- [ ] Valid event → extracts `accountUid`, triggers incremental sync
- [ ] Duplicate webhook delivery silently absorbed by idempotency constraint
- [ ] `ENABLE_BANKING_WEBHOOK_SECRET` wired in `.env.example`

**Tasks:**
- [ ] Create `/app/api/banking/webhook/route.ts`
- [ ] HMAC verification on raw `request.arrayBuffer()` bytes
- [ ] Reuse sync logic from Epic 3

**Dev Tests:**
- [ ] Valid signature + payload → sync triggered
- [ ] Invalid signature → 401
- [ ] Duplicate delivery → idempotency absorbs

---

### Story 6.2 — Error Handling + Observability
**Goal:** All errors produce clean user messages. Sync operations logged without PII.
**Browser test:** Kill network mid-sync → "Sync failed. Please try again." toast — no stack trace.
**Acceptance Criteria:**
- [ ] `422 WRONG_ASPSP_PROVIDED` → "Bank not found — please re-select from the list"
- [ ] Sync failure → toast, `lastSynced` not updated
- [ ] Invalid webhook → 401, logged
- [ ] Duplicate match → 409 with clear message
- [ ] Sync logs: accountUid (masked), date range, pages, records fetched, records inserted
- [ ] Zero PII in logs (no IBAN, no account name)

**Tasks:**
- [ ] Audit all `/app/api/banking/` routes for error handling completeness
- [ ] Add structured logging to sync flow
- [ ] Verify no PII in any log output

---

### Story 6.3 — Sandbox → Production Switch
**Goal:** `ENABLE_BANKING_BASE_URL` correctly toggles between sandbox and production. OQ-3 resolved.
**Browser test:** Set sandbox URL → full connect + sync flow works end-to-end.
**Acceptance Criteria:**
- [ ] All Enable Banking calls use `ENABLE_BANKING_BASE_URL` — zero hardcoded URLs
- [ ] `.env.example` documents sandbox URL and production URL

**Tasks:**
- [ ] Audit `/lib/enable-banking.ts` — confirm all URLs from env var
- [ ] Update `.env.example` with sandbox URL (resolves OQ-3)

---

## 🚦 Current Status
```
Working on:  EPIC-2 / Story 2.1 — JWT Auth + ASPSP Discovery
Blocked by:  OQ-3 (sandbox URL) — needed before live API calls; mocked tests unblocked
Next up:     Story 2.2 — Connect Flow UI
EPIC-1:      ✅ Complete (all 3 stories done)
```
