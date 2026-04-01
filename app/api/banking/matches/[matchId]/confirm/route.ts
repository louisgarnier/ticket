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

  const bankTransactionId = match.bankTransaction.id

  await prisma.$transaction([
    prisma.bankTransactionMatch.update({
      where: { id: matchId },
      data: { status: "confirmed", actionedAt: new Date(), actionedBy: user.id },
    }),
    prisma.bankTransactionMatch.updateMany({
      where: { bankTransactionId, id: { not: matchId }, status: "suggested" },
      data: { status: "rejected", actionedAt: new Date(), actionedBy: user.id },
    }),
  ])

  console.log(`✅ [BankingMatches] confirm: matchId=${matchId} bankTransactionId=${bankTransactionId} userId=${user.id}`)

  return NextResponse.json({ ok: true })
}
