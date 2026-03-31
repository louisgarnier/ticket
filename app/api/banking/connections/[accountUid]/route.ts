import { getCurrentUser } from "@/lib/auth"
import { deleteBankConnection } from "@/models/banking"
import { NextRequest, NextResponse } from "next/server"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ accountUid: string }> }
) {
  let user
  try {
    user = await getCurrentUser()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { accountUid } = await params

  try {
    await deleteBankConnection(accountUid, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[EnableBanking] disconnect error:", err)
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 })
  }
}
