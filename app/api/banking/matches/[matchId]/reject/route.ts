import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { matchId } = await params

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

  await prisma.bankTransactionMatch.update({
    where: { id: matchId },
    data: { status: "rejected", actionedAt: new Date(), actionedBy: user.id },
  })

  console.log(`✅ [BankingMatches] reject: matchId=${matchId} bankTransactionId=${match.bankTransaction.id} userId=${user.id}`)

  return NextResponse.json({ ok: true })
}
