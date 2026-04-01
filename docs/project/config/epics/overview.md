# Enable Banking — Epic Overview

> Goal: Pull bank trades from Enable Banking via OAuth + transaction sync.
> Later phase (not in scope here): match bank trades to invoice-generated trades.
> Stack: FastAPI (Railway) + Supabase + Next.js (Vercel)

---

## Open Questions — resolve before building

| # | Question | Priority |
|---|---|---|
| OQ-1 | **Session expiry & re-auth**: PSD2 typically requires full re-OAuth on consent expiry (no silent refresh). Confirm with Enable Banking docs. Once confirmed, add: expired-session detection on `/sync`, "Reconnect" CTA in UI, removal of stale `bank_connections` row. | **DEV BLOCKER for prod re-auth handling** |
| OQ-2 | **API error shapes**: No documentation on error responses beyond `422 WRONG_ASPSP_PROVIDED`. Need actual error shapes for expired session, revoked consent, rate limit. Check Enable Banking docs or test manually with a revoked session. | Flag — needed for robust error handling |
| OQ-3 | **Sandbox environment**: No sandbox base URL in current implementation. Enable Banking has a sandbox — find the URL and any required flag/header in their portal. Every dev test currently hits a real bank. | **DEV BLOCKER for safe development** |

---

## Epic Summary

| ID | Epic | Status | Stories |
|---|---|---|---|
| EPIC-1 | DB Migrations & Config | [ ] | 2 |
| EPIC-2 | Enable Banking Service | [ ] | 4 |
| EPIC-3 | API Routers | [ ] | 3 |
| EPIC-4 | Frontend | [ ] | 3 |
| EPIC-5 | Testing & QA | [ ] | 2 |

---

## Current Status
```
Working on: —
Blocked by: OQ-3 (sandbox URL) — resolve before writing any service tests
Next up: EPIC-1 / Story 1.1
```
