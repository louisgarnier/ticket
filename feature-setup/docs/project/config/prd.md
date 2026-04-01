# 📋 PRD — Invoice Reconciliation & Banking Integration
> Version: 2.0 — Merged: Reconciliation PRD v1.0 + Enable Banking Integration PRD
> Status: `[ ] Draft` → `[ ] Reviewed` → `[x] Locked`
> References: `feature-setup/docs/integrations/enablebanking.md` · `prd_reconciliation_v4.docx`

---

## 1. Project Summary
| Field | Value |
|---|---|
| **Project name** | Invoice Reconciliation & Banking Integration |
| **One-liner** | Connect bank accounts via Enable Banking OAuth, sync bank trades in near real-time, and reconcile them against existing invoice records and uploaded files with a rule-based matching engine |
| **Owner** | Louis Garnier |
| **Version** | 2.0 |
| **Target completion** | TBD |
| **Tech stack** | Next.js (Vercel) + FastAPI (Railway) + Supabase + Enable Banking API |

### Core Design Principle
The existing `transactions` table (invoice-originated records) is **READ ONLY** for this feature — no schema changes, no migrations, no new columns. Bank transactions live in a dedicated `bank_transactions` table. Score 100 (Exact Match) is auto-confirmed at sync time. All other matches require explicit user validation.

---

## 2. Problem Statement

### Current System
1. User loads an invoice or receipt (not yet persisted)
2. User saves → creates a row in `transactions` unconditionally
3. No bank feed. No external source of truth. No deduplication. No reconciliation.

### Problems Being Solved
| # | Problem | Impact Without This Feature |
|---|---|---|
| P1 | No bank feed — users manually enter all transactions with no cross-reference to actual bank activity | Manual, error-prone bookkeeping; no audit trail |
| P2 | No terminology clarity — "transaction" conflates invoice records and bank movements | Reporting errors, incorrect API usage, confusion |
| P3 | No deduplication — same payment produces two independent records | Overstated expenses/revenue, duplicate ledger entries |
| P4 | No matching layer — no mechanism to link a bank transaction to its invoice or file | Reconciliation impossible outside the app |

---

## 3. Terminology

> Labelling convention to disambiguate record types across UI, API, and documentation. DB schema for existing records is untouched.

| Label | DB Table | Definition |
|---|---|---|
| **Invoice Transaction** | `transactions` | Existing record created when a user saves an invoice or receipt. READ ONLY for this feature. |
| **Bank Transaction** | `bank_transactions` | Record imported from the bank feed via Enable Banking. New dedicated table. |
| **Match Record** | `bank_transaction_matches` | Join record linking one Bank Transaction to either one Invoice Transaction or one uploaded File. |
| **Uploaded / Unsorted File** | `files` | Uploaded document not yet linked to any transaction. Existing table, read-referenced only. |
| **Bank Connection** | `bank_connections` | OAuth session and account metadata for a connected bank account. New table. |

> **DB Constraint:** `Transaction` in code always refers to `transactions`. `BankTransaction` always refers to `bank_transactions`. Enforced in code reviews, API naming, and UI copy.

---

## 4. Goals

- G1: Users can connect one or more bank accounts via Enable Banking OAuth (PSD2)
- G2: Bank transactions synced into dedicated `bank_transactions` table — `transactions` untouched
- G3: Users can view Bank Transactions separately from Invoice Transactions
- G4: Users can manually match a Bank Transaction to an Invoice Transaction or an Unsorted File
- G5: Unmatched Bank Transactions usable as standalone records
- G6: Duplicate bank transactions silently rejected at import via idempotency constraint
- G7: Users can disconnect a bank account without losing synced Bank Transaction history
- G8: System scores match candidates (Exact → Strong → Fuzzy → Partial). Score 100 (Exact Match) auto-confirmed at sync time. Scores 60–99 surfaced as suggestions the user must explicitly accept or reject
- G9: Bank transactions sync automatically in near real-time via Enable Banking webhook push — no manual sync required (manual sync remains as fallback)
- G10: App detects when the 90-day OAuth consent is near expiry or has expired, and prompts the user to re-authenticate — restoring the connection without data loss
- G11: Users can export Bank Transactions (with match details) to CSV or Excel, filterable by date range, account, and match status

---

## 5. User Stories

### Must Have (MVP)
| ID | Story | Acceptance Criteria |
|---|---|---|
| US-01 | As a user, I want to pick my bank from a list and connect it | - [ ] Country selector shown first <br>- [ ] Bank dropdown populated from `GET /aspsps?country=XX` <br>- [ ] Bank names never hardcoded <br>- [ ] "Connect" redirects to bank OAuth page |
| US-02 | As a user, I want my bank to redirect back to the app after authorising | - [ ] `/banking/callback` reads `code` from URL <br>- [ ] App calls `POST /sessions` to exchange code <br>- [ ] Accounts stored in `bank_connections` via upsert — never delete on reconnect |
| US-03 | As a user, I want to sync my bank transactions | - [ ] First sync: 90 days back <br>- [ ] Incremental: uses `last_synced` from `bank_connections` <br>- [ ] All pages fetched via `continuation_key` loop <br>- [ ] Duplicates silently rejected via `(account_uid, external_id)` unique constraint |
| US-04 | As a user, I want to disconnect a bank account | - [ ] `bank_connections` row removed <br>- [ ] Synced `bank_transactions` NOT deleted |

### Should Have
| ID | Story | Acceptance Criteria |
|---|---|---|
| US-10 | As a user, I want to see my Bank Transactions in a dedicated view, separate from Invoice Transactions | - [ ] Bank Transactions in their own list/page <br>- [ ] Invoice Transactions unchanged and unaffected |
| US-11 | As a user, I want to manually match a Bank Transaction to an Invoice Transaction | - [ ] `bank_transaction_matches` record links the two <br>- [ ] Bank Transaction displays matched invoice description, category, files <br>- [ ] Invoice Transaction remains intact in `transactions` <br>- [ ] Matched Bank Transaction clearly flagged in list |
| US-12 | As a user, I want to manually match a Bank Transaction to an unsorted file | - [ ] `bank_transaction_matches` record links Bank Transaction to `file` <br>- [ ] File attaches to Bank Transaction display <br>- [ ] File removed from unsorted list after matching |
| US-13 | As a user, I want to see which Bank Transactions are unmatched | - [ ] Unmatched Bank Transactions clearly identifiable (badge/filter) |
| US-14 | As a user, I want Exact Match transactions to be confirmed automatically | - [ ] Score 100 matches (reference + amount + currency) auto-confirmed on sync — no user action required <br>- [ ] Auto-confirmed matches labelled "Auto-matched" in list <br>- [ ] User can unmatch an auto-confirmed match if needed |
| US-15 | As a user, I want the system to suggest match candidates for non-exact matches | - [ ] Scores 60–99 surfaced as ranked suggestions <br>- [ ] Each suggestion shows: confidence score, match type, matched record details <br>- [ ] User accepts or rejects. Rejecting surfaces next candidate <br>- [ ] If all rejected → falls back to manual matching |
| US-16 | As a user, I want my bank transactions to appear automatically without manually syncing | - [ ] Enable Banking webhook triggers incremental sync automatically on new bank activity <br>- [ ] Transactions appear within seconds of the bank event <br>- [ ] Manual sync remains available as fallback |
| US-17 | As a user, I want to be prompted to re-connect my bank when my consent expires | - [ ] App detects when 90-day session is within 7 days of expiry or has expired <br>- [ ] Clear in-app notification: "Your bank connection has expired — click to reconnect." <br>- [ ] Re-auth flow re-runs OAuth connect without deleting existing `bank_transactions` <br>- [ ] Sync resumes from `last_synced` after successful re-auth |
| US-18 | As a user, I want to export my Bank Transactions to CSV or Excel for my accountant | - [ ] Export button on Bank Transactions view <br>- [ ] Filters: date range, account, status (matched/unmatched/all) <br>- [ ] Columns: date, amount, currency, description, institution, match_status, match_type, confidence_score, matched_invoice_description, matched_invoice_amount, matched_invoice_category, matched_file_name <br>- [ ] Formats: CSV and Excel (.xlsx) <br>- [ ] Filename: `bank_transactions_{account}_{date_from}_{date_to}.{ext}` |

---

## 6. Data Model

### Existing — `transactions` (READ ONLY)
No changes. Referenced read-only via:
- `id` — FK target in `bank_transaction_matches.transaction_id`
- `user_id` — ownership scoping
- `description`, `amount`, `category` — displayed alongside a match record

### New — `bank_connections`
```sql
id               UUID          PK
user_id          UUID          FK → auth.users  (RLS)
session_id       TEXT          Enable Banking session identifier
account_uid      TEXT          UNIQUE — Enable Banking account UID
account_iban     TEXT          IBAN (must NOT appear in logs)
account_name     TEXT          Friendly name (must NOT appear in logs)
institution_name TEXT          Bank name (e.g. 'BNP Paribas')
last_synced      TIMESTAMPTZ   NULL until first sync completes
created_at       TIMESTAMPTZ   DEFAULT now()
```
- RLS: `own_bank_connections` — users access only their own rows
- On reconnect: upsert on `account_uid` — never delete the existing row

### New — `bank_transactions`
```sql
id               UUID          PK
user_id          UUID          FK → auth.users  (RLS)
account_uid      TEXT          FK → bank_connections.account_uid
external_id      TEXT          Bank-assigned ID (see FR-11 for resolution order)
idempotency_key  TEXT          UNIQUE — hash(account_uid + date + amount + description)
date             DATE          Value date (funds cleared)
amount           DECIMAL       Negative = debit (DBIT), positive = credit
currency         TEXT          ISO 4217 code
description      TEXT          Raw bank narrative
institution_name TEXT          Source bank name
raw_data         JSONB         Full Enable Banking response object
created_at       TIMESTAMPTZ   DEFAULT now()

UNIQUE (account_uid, external_id)
```
- RLS: users access only their own rows
- Duplicates silently absorbed by `(account_uid, external_id)` constraint

### New — `bank_transaction_matches`
```sql
id                   UUID          PK
bank_transaction_id  UUID          FK → bank_transactions.id
transaction_id       UUID          FK → transactions.id       NULLABLE
file_id              UUID          FK → files.id              NULLABLE
match_type           TEXT          'exact' | 'strong' | 'fuzzy' | 'partial' | 'manual'
confidence_score     INTEGER       0–100. Manual = 100 by definition.
status               TEXT          'suggested' | 'confirmed' | 'rejected'
suggested_at         TIMESTAMPTZ   When the engine generated the suggestion
actioned_at          TIMESTAMPTZ   When user confirmed or rejected
actioned_by          UUID          FK → auth.users

CHECK: exactly one of (transaction_id, file_id) must be non-null
PARTIAL UNIQUE INDEX on bank_transaction_id WHERE status = 'confirmed'
```

**Match lifecycle:**
```
suggested → user accepts  → confirmed   (Bank Transaction flagged matched)
suggested → user rejects  → rejected    (archived, next candidate surfaced)
confirmed → user deletes  → (Bank Transaction returns to unmatched, rejections restored to suggested)
score 100 → auto-confirmed at sync time → confirmed (labelled 'Auto-matched', user can unmatch)
```

---

## 7. Functional Requirements — Enable Banking

### Authentication
- FR-01: Every Enable Banking API call requires a fresh RS256 JWT, expiry 1 hour, `kid: ENABLE_BANKING_APP_ID`
- FR-02: Private key stored in Railway as base64 body only — no PEM headers, no newlines. Reconstructed at runtime with 64-char line wrapping. Never logged.

### Flow 1 — ASPSP Discovery
- FR-03: `GET /api/banking/aspsps?country=XX` proxies Enable Banking and returns `[{name, country}]`
- FR-04: Bank names never hardcoded — wrong name returns `422 WRONG_ASPSP_PROVIDED`

### Flow 2 — OAuth Connect
- FR-05: `POST /api/banking/connect {bank_name, bank_country}` → `POST /auth` with `access.valid_until` = 90 days, `psu_type: "business"`, `state` = random UUID, `redirect_url` = `FRONTEND_URL/banking/callback`
- FR-06: `POST /api/banking/sessions {code}` → `POST /sessions`, upserts `bank_connections` on `account_uid` conflict — existing rows never deleted

### Flow 3 — Transaction Sync
- FR-07: `POST /api/banking/sync {account_uid, full_sync}` fetches via `GET /accounts/{account_uid}/transactions?date_from=...`
- FR-08: `full_sync=true` or no `last_synced` → 90 days back; incremental → use `bank_connections.last_synced`
- FR-09: Paginate via `continuation_key` until exhausted — no truncation
- FR-10: `credit_debit_indicator == "DBIT"` → negative amount; all others → positive
- FR-11: `external_id` priority: `transaction_id` → `entry_reference` → `internal_transaction_id`
- FR-12: Inserted into `bank_transactions`. Duplicates silently absorbed by `UNIQUE (account_uid, external_id)`
- FR-13: `last_synced` updated only after fully successful sync — not on partial failure

### Flow 4 — Webhook Push
- FR-26: `POST /api/banking/webhook` receives Enable Banking event pushes. After HMAC-SHA256 verification on raw bytes, extracts `account_uid` and triggers incremental sync for that account (same logic as FR-07 with `full_sync=false`). Duplicate deliveries silently absorbed by idempotency constraint.

### Flow 5 — Session Expiry & Re-auth
- FR-27: App monitors `bank_connections` session expiry. When within 7 days of the 90-day expiry (or expired), user receives in-app notification: "Your bank connection has expired — click to reconnect." Re-auth re-runs OAuth connect (FR-05, FR-06), upserts `bank_connections` on `account_uid` conflict — no `bank_transactions` deleted. Sync resumes from `last_synced`.

### Environment Variables
```
ENABLE_BANKING_APP_ID           # App identifier — JWT kid
ENABLE_BANKING_PRIVATE_KEY      # RSA private key, base64 body only (no headers, no newlines)
ENABLE_BANKING_WEBHOOK_SECRET   # HMAC-SHA256 webhook verification secret
ENABLE_BANKING_BASE_URL         # Default: https://api.enablebanking.com (override for sandbox)
FRONTEND_URL                    # OAuth redirect_url — must match portal byte-for-byte
```

---

## 8. Functional Requirements — Matching & Reconciliation

### Scoring Rules
| Rank | Rule | Conditions | Score | Behaviour |
|---|---|---|---|---|
| 1 | Exact Match | Reference + amount + currency all match exactly | 100 | **Auto-confirmed** at sync time. No user action. |
| 2 | Strong Match | Amount + currency + value_date within ±3 days | 85 | Suggest — user validates |
| 3 | Fuzzy Match | Amount within tolerance + description similarity ≥ 80% | 60–80 | Suggest — user validates |
| 4 | Partial Match | Bank tx amount is fraction of invoice + reference hint | Variable | Suggest — flagged partial |
| 5 | No Match | No rule fires above threshold | < 60 | Manual review queue |

### Configurable Parameters
| Parameter | Default | Description |
|---|---|---|
| `auto_suggest_min_score` | 60 | Minimum score to surface a suggestion |
| `date_window_days` | 3 | Days either side of invoice date |
| `amount_tolerance_abs` | 0.50 | Absolute amount tolerance for fuzzy matching |
| `amount_tolerance_pct` | 0.5% | Percentage tolerance |
| `description_similarity_min` | 80% | Minimum fuzzy string similarity |
| `max_suggestions_per_tx` | 5 | Maximum suggestions per Bank Transaction |

### Engine Trigger Points
- After every successful sync — scores all newly imported Bank Transactions
- When user saves a new Invoice Transaction — scores against all unmatched Bank Transactions
- On-demand re-run — operator triggers full re-score from reconciliation dashboard

### Matching Functional Requirements
- FR-18: A match record links exactly one Bank Transaction to either one Invoice Transaction (`transaction_id`) or one File (`file_id`). Exactly one FK must be non-null — DB CHECK constraint.
- FR-19: Engine creates `suggested` records for all pairs scoring >= `auto_suggest_min_score`
- FR-20: Score 100 (reference + amount + currency match) → match created automatically with `status = 'confirmed'`, `match_type = 'exact'` at sync time. All other scores → `status = 'suggested'`, user must validate.
- FR-21: One confirmed match per Bank Transaction — partial unique index on `bank_transaction_id WHERE status = 'confirmed'`
- FR-22: Rejecting sets `status = 'rejected'`. Retained for audit. Other suggestions preserved.
- FR-23: All suggestions rejected → Bank Transaction flagged for manual review. User selects manually (`match_type = 'manual'`, `confidence_score = 100`, `status = 'confirmed'` directly)
- FR-24: Deleting a confirmed match → Bank Transaction returns to unmatched. Previous rejections restored to `suggested`.
- FR-25: Users only match their own records — enforced at application layer and RLS.
- FR-28: `GET /api/banking/export` accepts: `account_uid?`, `date_from`, `date_to`, `status (matched|unmatched|all)`, `format (csv|xlsx)`. Columns: date, amount, currency, description, institution, match_status, match_type, confidence_score, matched_invoice_description, matched_invoice_amount, matched_invoice_category, matched_file_name. Filename: `bank_transactions_{account}_{date_from}_{date_to}.{ext}`

### User Validation Flow
1. Bank Transactions with suggestions show a badge ("1 suggestion" / "3 suggestions")
2. Detail panel shows suggestions ranked by confidence score, highest first
3. Each suggestion card: confidence score, match type label, matched record details, Accept/Reject buttons
4. Accept → `POST /api/banking/matches/confirm/{match_id}` → `status = 'confirmed'`, all other suggestions for same Bank Transaction auto-rejected
5. Reject → `POST /api/banking/matches/reject/{match_id}` → archived, next suggestion stays visible
6. No suggestions / all rejected → Manual Review queue
7. All actions written to audit log: action type, match_id, user_id, timestamp, score

> **Auto-Confirm Rule:** Score 100 only (reference + amount + currency). Labelled "Auto-matched". User can always unmatch — no record is ever permanently locked.

---

## 9. Duplicate Prevention

| Layer | Name | Mechanism |
|---|---|---|
| 1 | Import Idempotency | `idempotency_key` UNIQUE (hash of account_uid + date + amount + description). `(account_uid, external_id)` also unique as second guard. |
| 2 | Match State Guard | Partial unique index on `bank_transaction_id WHERE status = 'confirmed'` — one confirmed match per Bank Transaction |
| 3 | Isolated Write Path | Zero write paths from this feature to `transactions`. Hard architectural guarantee. |

---

## 10. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/banking/aspsps?country=XX` | Proxies Enable Banking ASPSP list. Returns `[{name, country}]`. Never cached. |
| POST | `/api/banking/connect` | Initiates OAuth. Body: `{bank_name, bank_country}`. Returns auth URL. |
| POST | `/api/banking/sessions` | OAuth code exchange. Body: `{code}`. Upserts `bank_connections`. Returns connected accounts. |
| POST | `/api/banking/sync` | Transaction sync. Body: `{account_uid, full_sync?}`. Updates `last_synced` on success. |
| GET | `/api/banking/transactions` | Paginated `bank_transactions`. Filter: `matched|unmatched|all`. |
| DELETE | `/api/banking/connections/{account_uid}` | Disconnects bank. Removes `bank_connections` row. `bank_transactions` preserved. |
| POST | `/api/banking/reauth` | Re-initiates OAuth for existing connection. Body: `{account_uid}`. Upserts `bank_connections`. Preserves all `bank_transactions`. |
| POST | `/api/banking/matches` | Creates manual match. Body: `{bank_transaction_id, transaction_id?}` or `{bank_transaction_id, file_id?}`. `match_type = 'manual'`, `status = 'confirmed'` immediately. |
| POST | `/api/banking/matches/confirm/{match_id}` | Confirms suggested match. Sets `confirmed`. Auto-rejects all other suggestions for same Bank Transaction. |
| POST | `/api/banking/matches/reject/{match_id}` | Rejects suggestion. Sets `rejected`. Other suggestions preserved. |
| DELETE | `/api/banking/matches/{match_id}` | Removes confirmed match. Bank Transaction → unmatched. Rejections restored to `suggested`. |
| GET | `/api/banking/export` | CSV/Excel export. Params: `account_uid?`, `date_from`, `date_to`, `status`, `format`. |
| POST | `/api/banking/webhook` | Enable Banking webhook. HMAC-SHA256 on raw bytes. On valid event: triggers incremental sync for `account_uid`. 401 on invalid signature. |

All endpoints require authenticated Supabase session JWT. No public access.

---

## 11. Edge Cases

| Scenario | Handling |
|---|---|
| Bank Transaction with no matching invoice | Saved as unmatched. Usable standalone. May match to file or stay unmatched. |
| Invoice Transaction with no bank activity | Remains in `transactions` as-is. Existing flow unaffected. |
| Duplicate bank transaction import | Silently absorbed by `(account_uid, external_id)` and `idempotency_key` constraints. |
| User disconnects then reconnects | `bank_connections` upserted. `bank_transactions` preserved. `last_synced` drives incremental sync. |
| User attempts to match same bank transaction twice | 409: "This bank transaction already has a match." |
| Partial payment (bank tx ≠ invoice amount) | v1: user can still manually match. Discrepancy visible in match display. No splitting. |
| One bank transaction covers multiple invoices | Not supported in v1. UNIQUE enforces one-to-one. |
| FX transaction (cross-currency) | Stored as-is with original currency. Both currencies shown in UI. |
| 90-day consent expires | FR-27: app detects expiry, prompts re-auth. Connection restored without data loss. |
| `422 WRONG_ASPSP_PROVIDED` | "Bank not found — please re-select from the list." |
| Sync fails mid-pagination | `last_synced` NOT updated. User retriggers; idempotency handles overlap. |
| Webhook duplicate delivery | Silently absorbed by idempotency constraint. |

---

## 12. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Security | RSA private key never logged, never stored with PEM headers. In-memory reconstruction only. |
| NFR-02 | Security | Webhook: HMAC-SHA256 verified on raw request bytes BEFORE JSON parsing. Invalid → 401. |
| NFR-03 | Security | All `/api/banking/*` require authenticated Supabase JWT. Enforced at middleware. |
| NFR-04 | Security | RLS on `bank_connections` and `bank_transactions`. |
| NFR-05 | Security | IBAN and `account_name` never appear in logs or error messages. |
| NFR-06 | Reliability | Sync paginates fully — no truncation. |
| NFR-07 | Reliability | Duplicate inserts silently absorbed. No user-visible error. |
| NFR-08 | Reliability | `last_synced` only updated after fully successful sync. |
| NFR-09 | Observability | Sync logs: account_uid (masked), date range, pages fetched, records fetched, records inserted. |
| NFR-10 | Observability | No PII in logs. |
| NFR-11 | Isolation | Zero writes to `transactions` from banking integration code. |
| NFR-12 | Dev / Staging | Development uses Enable Banking sandbox only. Controlled via `ENABLE_BANKING_BASE_URL`. |

---

## 13. Error Handling Policy

| Scenario | Handling |
|---|---|
| Any Enable Banking HTTP error | Catch, log `status_code + response.text` (no PII). Surface clean user message. |
| `422 WRONG_ASPSP_PROVIDED` | "Bank not found — please re-select from the list." |
| Sync failure | Notify user. Do NOT update `last_synced`. Safe to retry. |
| Webhook invalid signature | 401. Log attempt (timestamp, IP — no body). |
| Duplicate match attempt | 409: "This bank transaction already has a match." |
| Match target not found or not owned | 404. Do not reveal whether record exists for other users. |
| Unknown error | Log raw response (no PII). Surface: "Bank connection error. Please try again or contact support." |
| Pagination failure mid-sync | Abort. Log last `continuation_key`. Do not update `last_synced`. |

---

## 14. Implementation Phases

| Phase | Name | Scope | Blocker |
|---|---|---|---|
| 0 | DB Schema | `bank_connections`, `bank_transactions`, `bank_transaction_matches`. RLS. Unique constraints. Partial unique index. No changes to `transactions`. | OQ-3 (sandbox) |
| 1 | Enable Banking Auth | JWT (RS256). ASPSP discovery. OAuth connect flow. `bank_connections` upsert. Re-auth endpoint. | Phase 0 + OQ-3 |
| 2 | Transaction Sync | Sync endpoint: full + incremental. Pagination. Amount sign. `external_id` resolution. Idempotent insert. | Phase 1 |
| 3 | Webhook Push | Webhook receiver with HMAC verification. On valid event: trigger incremental sync for `account_uid`. Duplicate delivery handling. | Phase 2 + OQ-2 |
| 4 | Bank Transactions UI | Bank Transactions list view. Matched/unmatched/suggested badges. Session expiry detection + in-app re-auth prompt. | Phase 3 |
| 5 | Matching Engine | Rule-based scoring. Auto-confirm score 100. Suggestion ranking UI. Accept/Reject flows. Manual review queue. On-demand re-score. | Phase 4 |
| 6 | Export | CSV + Excel export endpoint with date/account/status filters. | Phase 5 |
| 7 | Hardening | Observability. Error handling polish. Audit log viewer. Sandbox → production switch. | Phase 6 + OQ-1 |

> **Phase 0 is a hard prerequisite.** OQ-3 (sandbox credentials) is a blocker for Phase 0.

---

## 15. Constraints
- OAuth callback URL must match `FRONTEND_URL/banking/callback` exactly — byte-for-byte
- Development must use Enable Banking sandbox — never call production endpoints during dev
- No modifications to the existing `transactions` table or Prisma schema
- Enable Banking data is READ ONLY — never write back to the API
- IBAN and account names must not appear in any log output
- All git operations via `python3 scripts/git_ops.py`

---

## 16. Open Questions

| # | Question | Owner | Deadline | Status |
|---|---|---|---|---|
| OQ-1 | Session expiry: full re-OAuth required? Re-auth UX details? | Louis | Before Phase 7 | Open |
| OQ-2 | Enable Banking error shapes: expired session, revoked consent, rate limit | Louis | Before Phase 3 | Open |
| OQ-3 | Sandbox base URL and portal configuration | Louis | **BLOCKER — before Phase 0** | Open |
| OQ-4 | Partial payments supported in v1 (bank tx matched to fraction of invoice)? | Louis / Product | Before Phase 5 | Open |
| OQ-5 | Multi-account: user connects accounts from different banks simultaneously? UI / data model constraints? | Product | Before Phase 4 | Open |
| OQ-6 | Data retention policy for `bank_transactions` and `bank_transaction_matches` after disconnect | Legal / Product | Before Phase 7 | Open |

---

## 📝 Amendments Log

| Date | Change | Reason |
|---|---|---|
| March 2026 | Switched from single `transactions` table with `source` field to `bank_transactions` + `bank_transaction_matches` | Avoids risk to existing invoice/transaction flow |
| March 2026 | Merged Reconciliation PRD v1.0 + Enable Banking PRD into unified v2.0 | Single source of truth |
| March 2026 | Terminology clarification adopted without DB rename | Preserves DB stability |
| March 2026 | Non-Goals section removed. NG1 (auto-confirm score 100), NG2 (webhook), NG3 (re-auth), NG6 (export) promoted to in-scope. Score 100 now auto-confirmed. Webhook push, re-auth flow, CSV/Excel export added as goals and FRs. | User review: all deferred features promoted to full scope |
