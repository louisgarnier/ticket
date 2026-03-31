import { getCurrentUser } from "@/lib/auth"
import { createSession } from "@/lib/enable-banking"
import { createBankConnection } from "@/models/banking"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  let user
  try {
    user = await getCurrentUser()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { code } = await req.json()
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 })
  }

  try {
    const { sessionId, accounts } = await createSession(code)

    // Upsert each account as a BankConnection
    for (const account of accounts) {
      await createBankConnection({
        userId: user.id,
        sessionId,
        accountUid: account.account_uid,
        accountIban: account.iban,
        accountName: account.name,
        institutionName: account.institution_name,
      })
    }

    return NextResponse.json({ success: true, count: accounts.length })
  } catch (err) {
    console.error("[EnableBanking] createSession error:", err)
    return NextResponse.json({ error: "Failed to create bank session" }, { status: 500 })
  }
}
