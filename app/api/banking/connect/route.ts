import { getCurrentUser } from "@/lib/auth"
import { startAuth } from "@/lib/enable-banking"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    await getCurrentUser()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { aspspName, country } = await req.json()

  if (!aspspName || !country) {
    return NextResponse.json({ error: "aspspName and country required" }, { status: 400 })
  }

  const baseUrl = process.env.BASE_URL || "http://localhost:7331"
  const redirectUrl = `${baseUrl}/banking/callback`

  try {
    const authUrl = await startAuth(aspspName, country, redirectUrl)
    return NextResponse.json({ url: authUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[EnableBanking] startAuth error:", message)

    if (message.includes("422") || message.includes("WRONG_ASPSP")) {
      return NextResponse.json({ error: "Bank not found — please re-select from the list" }, { status: 422 })
    }

    return NextResponse.json({ error: "Failed to initiate bank connection" }, { status: 500 })
  }
}
