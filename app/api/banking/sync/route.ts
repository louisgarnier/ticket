import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import { fetchTransactions } from "@/lib/enable-banking"
import { createBankTransactionsBulk, updateBankConnectionLastSynced } from "@/models/banking"
import { scoreForBankTransaction } from "@/lib/matching-engine"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { accountUid, dateFrom: dateFromOverride } = body as { accountUid: string; dateFrom?: string }

  if (!accountUid) return NextResponse.json({ error: "accountUid required" }, { status: 400 })

  const connection = await prisma.bankConnection.findFirst({
    where: { accountUid, userId: user.id },
  })

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  }

  const dateFrom = dateFromOverride
    ? dateFromOverride
    : connection.lastSynced
      ? connection.lastSynced.toISOString().slice(0, 10)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  let total: number
  try {
    const rawTransactions = await fetchTransactions(accountUid, dateFrom)

    const transactions = rawTransactions.map((tx) => ({
      userId: user.id,
      accountUid,
      externalId: tx.externalId,
      idempotencyKey: `${accountUid}:${tx.externalId}`,
      date: new Date(tx.bookingDate),
      amount: tx.amount,
      currency: tx.currency,
      description: tx.description,
      institutionName: connection.institutionName ?? undefined,
      rawData: tx as Prisma.InputJsonValue,
    }))

    ;({ total } = await createBankTransactionsBulk(transactions))
  } catch (err) {
    console.error("[BankingSync] fetchTransactions/insert error:", err)
    return NextResponse.json({ error: "Failed to sync transactions" }, { status: 500 })
  }

  // Run matching engine for all bank transactions in this connection
  const allBankTxs = await prisma.bankTransaction.findMany({
    where: { accountUid: connection.accountUid },
    select: { id: true },
  })
  await Promise.allSettled(allBankTxs.map((tx) => scoreForBankTransaction(tx.id, user.id)))

  await updateBankConnectionLastSynced(accountUid)

  console.log(`✅ [BankingSync] synced: accountUid=${accountUid} count=${total}`)

  return NextResponse.json({ synced: total })
}
