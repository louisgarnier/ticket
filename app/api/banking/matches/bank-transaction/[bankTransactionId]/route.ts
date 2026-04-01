import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getBankTransactionWithMatches } from "@/models/banking"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bankTransactionId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { bankTransactionId } = await params
    const detail = await getBankTransactionWithMatches(bankTransactionId, user.id)

    if (!detail) {
      return NextResponse.json({ error: "Bank transaction not found" }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (err) {
    console.error("[bank-transaction/GET] error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
