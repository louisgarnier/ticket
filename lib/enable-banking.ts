import { SignJWT, importPKCS8 } from "jose"

function reconstructPem(base64Body: string, type: "RSA PRIVATE KEY" | "PRIVATE KEY" = "RSA PRIVATE KEY"): string {
  const clean = base64Body.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")
  const lines = clean.match(/.{1,64}/g) || []
  return `-----BEGIN ${type}-----\n${lines.join("\n")}\n-----END ${type}-----`
}

async function _makeJwt(): Promise<string> {
  const base64 = process.env.ENABLE_BANKING_PRIVATE_KEY!
  const appId = process.env.ENABLE_BANKING_APP_ID!

  let privateKey
  try {
    privateKey = await importPKCS8(reconstructPem(base64, "PRIVATE KEY"), "RS256")
  } catch {
    privateKey = await importPKCS8(reconstructPem(base64, "RSA PRIVATE KEY"), "RS256")
  }

  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: appId })
    .setIssuer(appId)
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)
}

export async function _authHeaders(): Promise<Record<string, string>> {
  const jwt = await _makeJwt()
  return {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  }
}

export async function getAspsps(country: string): Promise<{ name: string; country: string }[]> {
  const baseUrl = process.env.ENABLE_BANKING_BASE_URL!
  const headers = await _authHeaders()
  const res = await fetch(`${baseUrl}/aspsps?country=${encodeURIComponent(country)}`, { headers })
  if (!res.ok) {
    throw new Error(`Enable Banking API error: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return Array.isArray(data) ? data : (data.aspsps ?? [])
}

export async function startAuth(aspspName: string, country: string, redirectUrl: string): Promise<string> {
  const baseUrl = process.env.ENABLE_BANKING_BASE_URL!
  const headers = await _authHeaders()

  // valid_until: 90 days from now (Enable Banking max consent validity)
  const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const payload = {
    access: { valid_until: validUntil },
    aspsp: {
      name: aspspName,
      country: country,
    },
    state: crypto.randomUUID(),
    redirect_url: redirectUrl,
    psu_type: "personal",
  }

  const res = await fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Enable Banking POST /auth error: ${res.status} ${text}`)
  }

  const data = await res.json()
  // Enable Banking returns { url: "https://bank-oauth-url..." }
  return data.url
}

export type BankAccount = {
  account_uid: string
  iban?: string
  name?: string
  institution_name?: string
}

export async function createSession(code: string): Promise<{ sessionId: string; accounts: BankAccount[] }> {
  const baseUrl = process.env.ENABLE_BANKING_BASE_URL!
  const headers = await _authHeaders()

  const res = await fetch(`${baseUrl}/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code }),
  })

  if (!res.ok) {
    throw new Error(`Enable Banking POST /sessions error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const institutionName: string = data.aspsp?.name ?? ""

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAccounts: any[] = data.accounts ?? []
  const accounts: BankAccount[] = rawAccounts.map((a) => {
    const label = [a.name, a.details, a.currency].filter(Boolean).join(" · ")
    return {
      account_uid: a.uid,
      iban: a.account_id?.iban ?? null,
      name: label,
      institution_name: institutionName,
    }
  })

  return {
    sessionId: data.session_id,
    accounts,
  }
}

export type RawTransaction = {
  externalId: string
  amount: number
  currency: string
  bookingDate: string
  description: string
}

export async function fetchTransactions(
  accountUid: string,
  dateFrom: string
): Promise<RawTransaction[]> {
  const baseUrl = process.env.ENABLE_BANKING_BASE_URL!
  const headers = await _authHeaders()
  const dateTo = new Date().toISOString().slice(0, 10)

  const allTransactions: RawTransaction[] = []
  let continuationKey: string | undefined = undefined

  do {
    const url = new URL(`${baseUrl}/accounts/${accountUid}/transactions`)
    url.searchParams.set("date_from", dateFrom)
    url.searchParams.set("date_to", dateTo)
    if (continuationKey) {
      url.searchParams.set("continuation_key", continuationKey)
    }

    const res = await fetch(url.toString(), { headers })
    if (!res.ok) {
      throw new Error(`Enable Banking GET /accounts/${accountUid}/transactions error: ${res.status} ${await res.text()}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawTxs: any[] = data.transactions ?? []

    for (const tx of rawTxs) {
      const externalId =
        tx.transaction_id ?? tx.entry_reference ?? tx.internal_transaction_id ?? ""
      const rawAmount = parseFloat(tx.transaction_amount?.amount ?? "0")
      const amount = tx.credit_debit_indicator === "DBIT" ? -rawAmount : rawAmount
      const currency: string = tx.transaction_amount?.currency ?? ""
      const bookingDate: string = tx.booking_date ?? tx.value_date ?? ""
      const description: string = tx.remittance_information?.unstructured?.[0] ?? ""

      allTransactions.push({ externalId, amount, currency, bookingDate, description })
    }

    continuationKey = data.continuation_key ?? undefined
  } while (continuationKey)

  return allTransactions
}
