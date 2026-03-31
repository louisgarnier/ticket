import { getCurrentUser } from "@/lib/auth"
import { getAspsps } from "@/lib/enable-banking"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    await getCurrentUser()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const country = req.nextUrl.searchParams.get("country")
  if (!country) {
    return NextResponse.json({ error: "country parameter required" }, { status: 400 })
  }

  try {
    const aspsps = await getAspsps(country)
    return NextResponse.json(aspsps)
  } catch (err) {
    console.error("[EnableBanking] getAspsps error:", err)
    return NextResponse.json({ error: "Failed to fetch banks" }, { status: 500 })
  }
}
