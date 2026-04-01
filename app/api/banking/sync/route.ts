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

  // Fix 2: Move matching engine call and updateBankConnectionLastSynced inside the try/catch
  // so errors return a JSON 500 instead of crashing the process.
  // Fix 3: Use `inserted` (new rows only) instead of `total` (all fetched) in the response.
  let inserted: number
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

    ;({ inserted } = await createBankTransactionsBulk(transactions))

    await updateBankConnectionLastSynced(accountUid)

    // Fire-and-forget: run matching engine after response is sent — don't block the sync response
    const userId = user.id
    prisma.bankTransaction.findMany({
      where: { accountUid: connection.accountUid },
      select: { id: true },
    }).then((allBankTxs) =>
      Promise.allSettled(allBankTxs.map((tx) => scoreForBankTransaction(tx.id, userId)))
    ).catch((err) => console.error("[BankingSync] background scoring error:", err))

    console.log(`✅ [BankingSync] synced: accountUid=${accountUid} inserted=${inserted}`)
  } catch (err) {
    console.error("[BankingSync] sync error:", err)
    return NextResponse.json({ error: "Failed to sync transactions" }, { status: 500 })
  }

  return NextResponse.json({ synced: inserted })
}
