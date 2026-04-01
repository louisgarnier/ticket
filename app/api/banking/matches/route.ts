import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"

// POST — manual match: link a bank transaction to an invoice manually
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { bankTransactionId, transactionId } = body as { bankTransactionId: string; transactionId: string }

  if (!bankTransactionId || !transactionId) {
    return NextResponse.json({ error: "bankTransactionId and transactionId are required" }, { status: 400 })
  }

  // Verify bankTransaction belongs to user
  const bankTx = await prisma.bankTransaction.findFirst({
    where: { id: bankTransactionId, userId: user.id },
  })
  if (!bankTx) {
    return NextResponse.json({ error: "Bank transaction not found" }, { status: 404 })
  }

  // Verify invoice belongs to user
  const invoice = await prisma.transaction.findFirst({
    where: { id: transactionId, userId: user.id },
  })
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  // Check no existing confirmed match
  const existingConfirmed = await prisma.bankTransactionMatch.findFirst({
    where: { bankTransactionId, status: "confirmed" },
  })
  if (existingConfirmed) {
    return NextResponse.json({ error: "A confirmed match already exists for this transaction" }, { status: 409 })
  }

  const [newMatch] = await prisma.$transaction([
    prisma.bankTransactionMatch.create({
      data: {
        bankTransactionId,
        transactionId,
        matchType: "manual",
        confidenceScore: 100,
        status: "confirmed",
        actionedAt: new Date(),
        actionedBy: user.id,
      },
    }),
    prisma.bankTransactionMatch.updateMany({
      where: { bankTransactionId, status: "suggested" },
      data: { status: "rejected", actionedAt: new Date(), actionedBy: user.id },
    }),
  ])

  console.log(`✅ [BankingMatches] manual-match: matchId=${newMatch.id} bankTransactionId=${bankTransactionId} transactionId=${transactionId} userId=${user.id}`)

  return NextResponse.json({ ok: true, matchId: newMatch.id })
}
