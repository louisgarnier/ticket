import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mockEnableBanking } from "./mock-enable-banking"

// Note: getAspsps() unit tests require a real RS256 private key for JWT signing.
// JWT signing is tested manually / integration test.
// The fetch-level mock tests below cover the HTTP contract without a real key.

describe("Enable Banking — ASPSP discovery", () => {
  let restore: () => void

  beforeEach(() => {
    process.env.ENABLE_BANKING_BASE_URL = "https://api.enablebanking.com"
    restore = mockEnableBanking([
      {
        method: "GET",
        path: "/aspsps",
        response: [
          { name: "BNP Paribas", country: "FR" },
          { name: "Société Générale", country: "FR" },
          { name: "Crédit Agricole", country: "FR" },
        ],
      },
    ])
  })

  afterEach(() => restore())

  it("returns a list of ASPSPs with name and country", async () => {
    const baseUrl = process.env.ENABLE_BANKING_BASE_URL
    const res = await fetch(`${baseUrl}/aspsps?country=FR`)
    const data = await res.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0]).toHaveProperty("name")
    expect(data[0]).toHaveProperty("country")
    expect(data[0].country).toBe("FR")
  })
})
