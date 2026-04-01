import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"

// DELETE — unmatch: restore this match to "suggested", restore all rejected matches to "suggested"
export async function DELETE(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { matchId } = await params

  try {
    const match = await prisma.bankTransactionMatch.findFirst({
      where: { id: matchId },
      include: { bankTransaction: { select: { userId: true, id: true } } },
    })

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 })
    }

    if (match.bankTransaction.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const bankTransactionId = match.bankTransaction.id

    await prisma.$transaction([
      prisma.bankTransactionMatch.update({
        where: { id: matchId },
        data: { status: "suggested", actionedAt: null, actionedBy: null },
      }),
      prisma.bankTransactionMatch.updateMany({
        where: { bankTransactionId, id: { not: matchId }, status: "rejected" },
        data: { status: "suggested", actionedAt: null, actionedBy: null },
      }),
    ])

    console.log(`✅ [BankingMatches] unmatch: matchId=${matchId} bankTransactionId=${bankTransactionId} userId=${user.id}`)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[matches/delete] error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
