# ACTIVE — Enable Banking Integration

> One story at a time. Stop after each story. Wait for "go" before the next.

---

## EPIC-1: DB Migrations & Config

### Story 1.1 — Database Migrations
**Goal:** Schema is ready for bank connections and transactions before any code is written.
**Acceptance Criteria:**
- [ ] `bank_connections` table created with RLS policy `own_bank_connections`
- [ ] `transactions` table has `account_uid` column and unique constraint on `(account_uid, external_id)`
- [ ] Both tables have `user_id` foreign key to `auth.users` with `on delete cascade`
- [ ] Migrations run cleanly on a fresh Supabase instance

**Tasks:**
- [ ] Write migration: create `bank_connections` table (schema from enablebanking.md)
- [ ] Write migration: add `account_uid` + `source_bank` columns to `transactions` if not present
- [ ] Write migration: add unique constraint `transactions_account_uid_external_id_key` on `(account_uid, external_id)` — this is the idempotency guarantee, not just a dedup hint
- [ ] Enable RLS + create `own_bank_connections` policy
- [ ] Verify migrations run without error

**Dev Tests:**
- [ ] Insert two transactions with same `(account_uid, external_id)` — second must fail with unique violation
- [ ] Insert same account_uid with different external_id — must succeed
- [ ] Verify RLS: user A cannot read user B's `bank_connections`

**Note on Item 5 (concurrent sync):** The unique constraint on `(account_uid, external_id)` is the correct fix. It makes inserts idempotent regardless of concurrency — two simultaneous syncs will race, one wins, the other gets a unique violation which is swallowed. No application-level locking needed.

---

### Story 1.2 — Config & Environment Wiring
**Goal:** All Enable Banking env vars are accessible in the app with clear failure on missing values.
**Acceptance Criteria:**
- [ ] `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY`, `ENABLE_BANKING_WEBHOOK_SECRET`, `FRONTEND_URL` added to `config.py`
- [ ] App fails loudly at startup if any required var is missing (not silently at first call)
- [ ] `.env.example` updated with all four vars + instructions for private key format
- [ ] `ENABLE_BANKING_BASE_URL` is configurable (prep for OQ-3 sandbox URL)

**Tasks:**
- [ ] Add vars to `config.py` with validation
- [ ] Add `ENABLE_BANKING_BASE_URL` defaulting to `https://api.enablebanking.com` — overridable for sandbox
- [ ] Update `.env.example` with format note: private key = base64 body only, no PEM headers, no newlines
- [ ] Confirm startup fails fast if vars are absent

**Dev Tests:**
- [ ] App raises on startup when `ENABLE_BANKING_APP_ID` is missing
- [ ] `ENABLE_BANKING_BASE_URL` override works (used in service layer)

---

## EPIC-2: Enable Banking Service

### Story 2.1 — JWT Auth
**Goal:** Generate valid RS256 JWTs for every API call, including Railway's newline-stripped key.
**Acceptance Criteria:**
- [ ] `_make_jwt()` produces a valid RS256 JWT with correct payload and `kid` header
- [ ] PEM reconstruction works for both: raw base64 body (Railway) and already-valid PEM
- [ ] `_auth_headers()` returns `Authorization: Bearer <token>`
- [ ] JWT has 1-hour expiry

**Tasks:**
- [ ] Implement `_make_jwt()` in `services/enable_banking.py` with PEM reconstruction logic
- [ ] Implement `_auth_headers()` wrapping `_make_jwt()`
- [ ] Handle both key formats (raw base64 body + already-valid PEM)

**Dev Tests:**
- [ ] Decode generated JWT, assert `iss`, `aud`, `kid`, `exp - iat == 3600`
- [ ] Test with base64-only key (no headers) — must produce valid JWT
- [ ] Test with full PEM key — must also produce valid JWT
- [ ] Test with newline-escaped key (`\n` chars) — must reconstruct correctly

---

### Story 2.2 — ASPSP Discovery
**Goal:** Fetch the list of available banks for a given country from Enable Banking.
**Acceptance Criteria:**
- [ ] `get_aspsps(country)` returns list of `{name, country}` dicts
- [ ] Uses auth headers from Story 2.1
- [ ] Never hardcodes bank names — always uses API response

**Tasks:**
- [ ] Implement `get_aspsps(country: str)` calling `GET /aspsps?country=XX`
- [ ] Raise with clear message on non-200

**Dev Tests:**
- [ ] Mock HTTP 200 — assert returns list of name/country pairs
- [ ] Mock HTTP 4xx — assert raises with informative error

---

### Story 2.3 — OAuth Connect Flow
**Goal:** Initiate bank OAuth and exchange authorization code for a session with account UIDs.
**Acceptance Criteria:**
- [ ] `start_auth(bank_name, bank_country)` returns an authorization URL
- [ ] `create_session(auth_code)` returns session_id + list of account UIDs with metadata
- [ ] `valid_until` set to 90 days from now
- [ ] State param is a random UUID (CSRF protection)
- [ ] Redirect URL constructed from `FRONTEND_URL` env var

**Tasks:**
- [ ] Implement `start_auth(bank_name, bank_country)` → `POST /auth` → return auth URL
- [ ] Implement `create_session(auth_code)` → `POST /sessions` → return session + accounts
- [ ] Flag OQ-1 in code comment: session expiry handling not yet implemented

**Dev Tests:**
- [ ] `start_auth` — mock POST /auth, assert URL returned, assert payload has correct fields
- [ ] `create_session` — mock POST /sessions, assert returns session_id + account list
- [ ] `start_auth` with wrong bank name — mock 422, assert raises with `WRONG_ASPSP_PROVIDED` hint

---

### Story 2.4 — Transaction Sync
**Goal:** Fetch all transactions for an account UID with pagination, correct amount signs, and dedup.
**Acceptance Criteria:**
- [ ] `fetch_transactions(account_uid, date_from)` fetches all pages via `continuation_key`
- [ ] Amounts: negative for DBIT, positive for CRDT
- [ ] `external_id` resolved in priority order: `transaction_id` → `entry_reference` → `internal_transaction_id`
- [ ] Transactions upserted into DB with `(account_uid, external_id)` dedup (unique constraint handles conflict)
- [ ] `last_synced` updated on `bank_connections` after successful sync
- [ ] First sync / `full_sync=True`: 90-day window. Incremental: use `last_synced`

**Tasks:**
- [ ] Implement `fetch_transactions(account_uid, date_from)` with pagination loop
- [ ] Implement amount sign logic
- [ ] Implement `external_id` resolution with priority order
- [ ] Insert transactions using `on_conflict="account_uid,external_id" ignore` (or equivalent)
- [ ] Update `bank_connections.last_synced` on success

**Dev Tests:**
- [ ] Single page — assert all transactions stored, `last_synced` updated
- [ ] Multi-page — mock two pages via `continuation_key`, assert both pages stored
- [ ] DBIT transaction — assert amount is negative
- [ ] CRDT transaction — assert amount is positive
- [ ] Duplicate sync — run twice, assert no duplicate rows (constraint absorbs second insert)
- [ ] Missing `transaction_id` — assert falls back to `entry_reference`

---

## EPIC-3: API Routers

### Story 3.1 — Banking Router
**Goal:** All bank connection and sync endpoints are live and authenticated.
**Acceptance Criteria:**
- [ ] `GET /api/banking/aspsps?country=XX` returns bank list
- [ ] `POST /api/banking/connect` returns authorization URL
- [ ] `POST /api/banking/sessions` exchanges code, upserts connections
- [ ] `POST /api/banking/sync` syncs transactions for an account
- [ ] `GET /api/banking/connections` returns user's connected accounts
- [ ] `DELETE /api/banking/connections/{account_uid}` removes a connection
- [ ] All endpoints require authenticated user (Supabase JWT)
- [ ] Sessions upsert on reconnect — never delete existing rows

**Tasks:**
- [ ] Implement all 6 endpoints in `routers/banking.py`
- [ ] Wire router in `main.py`
- [ ] Upsert logic: `on_conflict="account_uid"` for `bank_connections`

**Dev Tests:**
- [ ] `/aspsps` — mock service, assert response shape
- [ ] `/connect` — mock service, assert auth URL returned
- [ ] `/sessions` — mock service + DB upsert, assert accounts stored
- [ ] `/sync` — mock service, assert transactions stored, last_synced updated
- [ ] `/connections` — assert only returns current user's connections (RLS)
- [ ] `DELETE /connections/{uid}` — assert row removed
- [ ] Unauthenticated request to any endpoint — assert 401

---

### Story 3.2 — Webhook Router
**Goal:** Enable Banking can push transactions in real time, verified with HMAC-SHA256.
**Acceptance Criteria:**
- [ ] `POST /api/webhooks/enable-banking` accepts webhook payloads
- [ ] HMAC-SHA256 signature verified against raw request body BEFORE JSON parsing
- [ ] Invalid signature returns 401
- [ ] Valid payload saves transactions using same logic as sync

**Tasks:**
- [ ] Implement `routers/webhooks.py` with HMAC verification
- [ ] Read raw body bytes before JSON parse
- [ ] Reuse transaction save logic from service layer
- [ ] Register router in `main.py`

**Dev Tests:**
- [ ] Valid signature + valid payload — assert transactions saved
- [ ] Invalid signature — assert 401
- [ ] Valid signature, compact vs non-compact JSON — assert signature check uses same serialization as sender
- [ ] Missing signature header — assert 401

---

### Story 3.3 — Error Handling & OQ-2 Resolution
**Goal:** API errors from Enable Banking are surfaced cleanly, not as raw status codes.
**Acceptance Criteria:**
- [ ] Known errors (422 WRONG_ASPSP_PROVIDED) produce clear user-facing messages
- [ ] Expired/revoked session detected and surfaced as a distinct error type (pending OQ-1 + OQ-2)
- [ ] Rate limit (429) produces a retry-after hint if available

**Tasks:**
- [ ] Research or test Enable Banking error response shapes (resolves OQ-2)
- [ ] Map HTTP status codes + error bodies to typed exceptions
- [ ] Update service layer to raise typed exceptions
- [ ] Update routers to return clean error responses

**Note:** This story is partially blocked on OQ-2. Start with what's known (422), leave hooks for session expiry once OQ-1 is resolved.

---

## EPIC-4: Frontend

### Story 4.1 — ASPSP Picker & Connect Flow
**Goal:** User can select their bank and initiate the OAuth flow.
**Acceptance Criteria:**
- [ ] Country selector → bank dropdown populated from `/api/banking/aspsps`
- [ ] "Connect" button calls `/api/banking/connect` and redirects user to bank's auth page
- [ ] Bank names come from API — never hardcoded

**Tasks:**
- [ ] Build ASPSP picker component (country → bank dropdown)
- [ ] Wire to `GET /api/banking/aspsps?country=XX`
- [ ] On connect, call `POST /api/banking/connect`, redirect to returned URL

---

### Story 4.2 — OAuth Callback Page
**Goal:** After bank auth, the authorization code is exchanged and connections are stored.
**Acceptance Criteria:**
- [ ] `/banking/callback` page reads `code` from URL params
- [ ] Calls `POST /api/banking/sessions` with the code
- [ ] On success: shows connected accounts, redirects to connections page
- [ ] On error: shows clear error message

**Tasks:**
- [ ] Implement `/banking/callback` page
- [ ] Handle `code` + `state` from URL params
- [ ] Call sessions endpoint, handle success/error states

---

### Story 4.3 — Connections List & Sync
**Goal:** User can see their connected bank accounts and trigger a sync.
**Acceptance Criteria:**
- [ ] Connections page shows all connected accounts (institution, IBAN, last synced)
- [ ] "Sync" button per account triggers `POST /api/banking/sync`
- [ ] "Disconnect" button calls `DELETE /api/banking/connections/{uid}`
- [ ] Expired session (OQ-1) surfaces a "Reconnect" CTA — implement once OQ-1 is resolved

**Tasks:**
- [ ] Build connections list component
- [ ] Sync button with loading state
- [ ] Disconnect button with confirmation
- [ ] Placeholder for reconnect flow (OQ-1)

---

## EPIC-5: Testing & QA

### Story 5.1 — Full Dev Test Suite
**Goal:** All dev tests pass, zero failures, >80% coverage on service and router layers.
**Acceptance Criteria:**
- [ ] `pytest` runs clean — zero failures
- [ ] Coverage report generated
- [ ] All stories' acceptance criteria covered by at least one test

**Tasks:**
- [ ] Run `pytest --cov` and fill coverage gaps
- [ ] Fix any flaky tests

---

### Story 5.2 — Integration Smoke Test
**Goal:** Full bank connect → sync flow runs end-to-end on sandbox (resolves OQ-3).
**Acceptance Criteria:**
- [ ] OQ-3 resolved: sandbox URL configured
- [ ] Can connect a sandbox bank account, trigger sync, verify transactions in DB
- [ ] Webhook endpoint tested with a real Enable Banking test payload

**Note:** Blocked on OQ-3 (sandbox URL). Do not attempt against production banks during development.
