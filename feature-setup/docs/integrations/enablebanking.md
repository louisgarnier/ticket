# Enable Banking Integration Blueprint

> Reusable reference for implementing Enable Banking (bank OAuth + transaction sync) in any project.
> Stack: FastAPI (Railway) + Supabase + Next.js (Vercel)
> Portal: https://enablebanking.com — register app, generate key pair, configure callback URL.

---

## What Enable Banking does

Enable Banking is a PSD2 aggregator. It lets users connect their bank account via OAuth and authorises your app to fetch their transactions. It sits between your app and the bank.

Key concepts:
- **ASPSP** — the bank (e.g. "Revolut", "BNP Paribas"). Names are owned by the API — never hardcode, always fetch from `/aspsps`.
- **PSU** — Payment Service User. Set `psu_type: "business"` for business accounts.
- **Session** — created after the user authorises. Contains one or more accounts.
- **Account UID** — the stable identifier for a bank account. Used for all transaction fetches.
- **Authorization code** — short-lived, exchanged once for a session. Delivered via OAuth callback.

---

## Authentication — RS256 JWT

Every API call requires a Bearer JWT signed with your RS256 private key.

### How it works
1. Generate an RSA key pair in the Enable Banking portal
2. Store the private key in Railway env var `ENABLE_BANKING_PRIVATE_KEY`
3. On every API call, generate a fresh JWT (1-hour expiry) and pass it as `Authorization: Bearer <token>`

### JWT payload
```python
{
    "iss": "enablebanking.com",
    "aud": "api.enablebanking.com",
    "iat": int(time.time()),
    "exp": int(time.time()) + 3600,
}
```
Headers must include `"kid": ENABLE_BANKING_APP_ID`.

### Private key format — critical gotcha
Railway strips newlines from env vars. The key must be reconstructed at runtime:

```python
import textwrap

def _make_jwt() -> str:
    raw = ENABLE_BANKING_PRIVATE_KEY.replace("\\n", "\n").strip()
    if raw.startswith("-----BEGIN"):
        private_key = raw  # already valid PEM
    else:
        # Reconstruct from raw base64 body (Railway stripped newlines)
        body = "".join(raw.split())
        wrapped = "\n".join(textwrap.wrap(body, 64))
        private_key = f"-----BEGIN PRIVATE KEY-----\n{wrapped}\n-----END PRIVATE KEY-----"
    return pyjwt.encode(payload, private_key, algorithm="RS256", headers={"kid": APP_ID})
```

**Rule:** Never store the key with headers in Railway. Store only the base64 body. The code adds the headers at runtime.

---

## API Flows

### Flow 1 — Connect a bank (OAuth)

```
Frontend → POST /api/banking/connect { bank_name, bank_country }
Backend  → Enable Banking POST /auth → returns authorization URL
Frontend → redirect user to URL
User     → authorises on bank's website
Bank     → redirects to REDIRECT_URL?code=XXX&state=YYY
Frontend → POST /api/banking/sessions { code: XXX }
Backend  → Enable Banking POST /sessions → returns session + accounts
Backend  → upsert accounts into bank_connections table
```

**Enable Banking POST /auth payload:**
```python
{
    "access": { "valid_until": "2025-06-01T00:00:00+00:00" },  # 90 days recommended
    "aspsp": { "name": bank_name, "country": bank_country },
    "state": str(uuid.uuid4()),  # random, for CSRF protection
    "redirect_url": REDIRECT_URL,
    "psu_type": "business",
}
```

**REDIRECT_URL** must be registered exactly in the Enable Banking portal. Format: `https://your-frontend.vercel.app/banking/callback`

**Sessions upsert — never delete:**
```python
db.table("bank_connections").upsert(
    { "user_id": user_id, "session_id": session_id, "account_uid": account_uid, ... },
    on_conflict="account_uid",
).execute()
```
Always upsert, never delete existing connections — a reconnect should update, not wipe.

---

### Flow 2 — Fetch bank list (ASPSP discovery)

```
Frontend → GET /api/banking/aspsps?country=FR
Backend  → Enable Banking GET /aspsps?country=FR
Backend  → returns [{ name, country }, ...]
Frontend → renders dropdown
```

**Never hardcode bank names.** The API returns exact names. Using a different string returns `422 WRONG_ASPSP_PROVIDED`.

---

### Flow 3 — Sync transactions

```
Frontend → POST /api/banking/sync { account_uid, full_sync: false }
Backend  → determine date_from (last_synced or 90-day window)
Backend  → Enable Banking GET /accounts/{account_uid}/transactions?date_from=...
Backend  → paginate via continuation_key
Backend  → dedup + insert into transactions table
Backend  → update bank_connections.last_synced
```

**Pagination:**
```python
params = { "date_from": date_from }
while True:
    resp = httpx.get(f"{BASE_URL}/accounts/{account_uid}/transactions", params=params, ...)
    transactions.extend(resp.json().get("transactions", []))
    continuation_key = resp.json().get("continuation_key")
    if not continuation_key:
        break
    params["continuation_key"] = continuation_key
```

**external_id resolution** (in priority order):
```python
external_id = (
    txn.get("transaction_id")
    or txn.get("entry_reference")
    or txn.get("internal_transaction_id")
)
```

**Amount sign:**
```python
amount = float(txn["transaction_amount"]["amount"])
if txn.get("credit_debit_indicator", "DBIT") == "DBIT":
    amount = -abs(amount)
else:
    amount = abs(amount)
```

**Sync window:**
- First sync or `full_sync=True`: 90 days back
- Incremental: use `last_synced` date from `bank_connections`

---

### Flow 4 — Webhook (real-time push)

Enable Banking can push new transactions via webhook. Secured with HMAC-SHA256.

```
Enable Banking → POST /api/webhooks/enable-banking
                 Header: X-Enable-Banking-Signature: <hex digest>
                 Body: { account: { institution_name }, transactions: [...] }
```

**Signature verification:**
```python
def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

**Critical:** Read the raw body bytes BEFORE parsing JSON. The signature is computed on the raw bytes.

```python
body = await request.body()  # raw bytes
if not verify_signature(body, x_enable_banking_signature, WEBHOOK_SECRET):
    raise HTTPException(401)
payload = json.loads(body)
```

---

## Data Model

### `bank_connections` table
```sql
create table bank_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  session_id       text not null,
  account_uid      text not null unique,
  account_iban     text,
  account_name     text,
  institution_name text,
  last_synced      timestamptz,
  created_at       timestamptz default now()
);

alter table bank_connections enable row level security;
create policy "own_bank_connections"
  on bank_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### `transactions` table (relevant columns)
```sql
create table transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  account_uid text,           -- which bank account this came from
  external_id text,           -- from Enable Banking (transaction_id / entry_reference)
  date        date not null,
  amount      numeric(10,2) not null,  -- negative = debit, positive = credit
  description text,
  currency    text default 'EUR',
  source_bank text,
  created_at  timestamptz default now(),
  constraint transactions_account_uid_external_id_key unique (account_uid, external_id)
);
```

**Why `(account_uid, external_id)` not just `external_id`:**
Revolut FX exchange trades produce two transactions with the same `transaction_id` — one on each account (e.g. CAD → EUR). A global unique constraint on `external_id` drops the second leg as a duplicate. Scope dedup to account.

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `ENABLE_BANKING_APP_ID` | Railway | Your app ID from the Enable Banking portal |
| `ENABLE_BANKING_PRIVATE_KEY` | Railway | RSA private key body (base64 only, no headers, no newlines) |
| `ENABLE_BANKING_WEBHOOK_SECRET` | Railway | Webhook signing secret from the portal |
| `FRONTEND_URL` | Railway | Your Vercel URL — used to construct the OAuth callback URL |

---

## Enable Banking Portal Setup

1. Create account at https://enablebanking.com
2. Create an application — note the **App ID**
3. Generate RSA key pair in the portal — download the private key
4. Strip PEM headers and newlines from the private key → paste the base64 body into Railway as `ENABLE_BANKING_PRIVATE_KEY`
5. Set the **redirect URL** to `https://your-vercel-url/banking/callback` — must match exactly what your backend sends in `POST /auth`
6. Copy the **webhook secret** → paste into Railway as `ENABLE_BANKING_WEBHOOK_SECRET`
7. Register your webhook endpoint URL: `https://your-railway-url/api/webhooks/enable-banking`

**After any Railway deploy:** verify the callback URL still matches. If the Vercel URL changes (e.g. new project), update it in the portal immediately.

---

## Implementation Order

Follow this sequence in a new project:

1. **Migration** — create `bank_connections` table + RLS. Add `account_uid` + composite unique constraint to `transactions`.
2. **Config** — add `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY`, `ENABLE_BANKING_WEBHOOK_SECRET` to `config.py`
3. **Service** — implement `enable_banking.py`: `_make_jwt()`, `_auth_headers()`, `start_auth()`, `create_session()`, `get_aspsps()`, `fetch_transactions()`
4. **Webhook router** — implement `webhooks.py`: HMAC verification, `save_transactions()`
5. **Banking router** — implement `banking.py`: `/aspsps`, `/connect`, `/sessions`, `/sync`, `/connections`, `DELETE /connections/{uid}`
6. **Wire up** — register both routers in `main.py`
7. **Frontend** — ASPSP picker (fetch from `/aspsps`), connect flow, callback page, sync buttons
8. **Portal** — register callback URL + webhook URL in Enable Banking portal
9. **Tests** — mock Enable Banking API for all router tests; test HMAC verification; test dedup logic

---

## Known Gotchas

| Gotcha | Rule |
|---|---|
| ASPSP names are API-owned | Never hardcode. Always fetch from `GET /aspsps`. Wrong name = `422 WRONG_ASPSP_PROVIDED`. |
| FX trades share transaction_id across accounts | Dedup must be `(account_uid, external_id)`, not just `external_id`. |
| Railway strips newlines from private key | Store base64 body only. Reconstruct PEM with headers + 64-char line wrapping at runtime. |
| Callback URL must match exactly | Registered URL in portal must be byte-for-byte identical to what backend sends. No trailing slash differences. |
| Sessions must upsert, not replace | A reconnect updates the session — never delete existing connections. |
| Webhook signature uses raw bytes | Verify before JSON parsing. `request.body()` must be called before `json.loads()`. |
| HMAC test helper must match wire format | Use `json.dumps(payload)` default separators — same as `httpx json=` kwarg. Compact separators produce a different signature. |
