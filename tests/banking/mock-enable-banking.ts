/**
 * Mock helper for Enable Banking HTTP calls.
 * Intercepts fetch calls to ENABLE_BANKING_BASE_URL.
 * Usage: call mockEnableBanking() in beforeEach, restore in afterEach.
 */

type MockRoute = {
  method: string
  path: string
  response: unknown
  status?: number
}

export function mockEnableBanking(routes: MockRoute[]) {
  const baseUrl = process.env.ENABLE_BANKING_BASE_URL || "https://api.enablebanking.com"

  const originalFetch = global.fetch

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method || "GET").toUpperCase()

    if (url.startsWith(baseUrl)) {
      const urlPath = url.replace(baseUrl, "").split("?")[0]
      const route = routes.find((r) => r.method.toUpperCase() === method && urlPath.startsWith(r.path))

      if (route) {
        return new Response(JSON.stringify(route.response), {
          status: route.status || 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response(JSON.stringify({ error: "Not mocked" }), { status: 404 })
    }

    return originalFetch(input, init)
  }

  return () => {
    global.fetch = originalFetch
  }
}
