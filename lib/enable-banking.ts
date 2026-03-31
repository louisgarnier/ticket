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
    .setAudience("enablebanking.com")
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
