import { prisma } from "@/lib/db"

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean))
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean))
  if (wordsA.size === 0 && wordsB.size === 0) return 0
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return union === 0 ? 0 : intersection / union
}

function daysDiff(dateA: Date, dateB: Date): number {
  return Math.abs((dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24))
}

// ──────────────────────────────────────────────
// Score a bank transaction against all eligible invoice transactions.
// Returns the number of match records created/updated.
// ──────────────────────────────────────────────
export async function scoreForBankTransaction(
  bankTransactionId: string,
  userId: string,
  targetInvoiceTransactionId?: string
): Promise<number> {
  // Fix 1: Fetch the bank transaction scoped to userId to prevent cross-user access
  const bankTx = await prisma.bankTransaction.findFirst({
    where: { id: bankTransactionId, userId },
    include: { matches: { select: { transactionId: true, status: true } } },
  })

  if (!bankTx) return 0

  // If already confirmed, skip
  const hasConfirmed = bankTx.matches.some((m) => m.status === "confirmed")
  if (hasConfirmed) return 0

  // IDs already linked to this bank transaction
  const alreadyMatchedInvoiceIds = new Set(bankTx.matches.map((m) => m.transactionId).filter(Boolean) as string[])

  // Fix 5 & 6: Fetch eligible invoice transactions
  // When targetInvoiceTransactionId is set, only score against that specific invoice.
  // Otherwise fetch up to 500 most recent invoices to cap memory usage.
  const invoiceTxs = targetInvoiceTransactionId
    ? await prisma.transaction.findMany({
        where: { id: targetInvoiceTransactionId, userId },
        select: {
          id: true,
          total: true,
          currencyCode: true,
          issuedAt: true,
          description: true,
          name: true,
        },
      })
    : await prisma.transaction.findMany({
        where: {
          userId,
          total: { not: null },
          currencyCode: { not: null },
        },
        orderBy: { issuedAt: "desc" },
        take: 500,
        select: {
          id: true,
          total: true,
          currencyCode: true,
          issuedAt: true,
          description: true,
          name: true,
        },
      })

  const bankAmount = Number(bankTx.amount)
  const bankCurrency = bankTx.currency.toUpperCase()
  const bankDate = bankTx.date
  const bankDesc = bankTx.description ?? ""

  type Candidate = {
    transactionId: string
    matchType: string
    confidenceScore: number
    status: string
  }

  const candidates: Candidate[] = []

  for (const inv of invoiceTxs) {
    if (alreadyMatchedInvoiceIds.has(inv.id)) continue

    const invAmount = (inv.total ?? 0) / 100 // cents → decimal
    const invCurrency = (inv.currencyCode ?? "").toUpperCase()
    const invDate = inv.issuedAt ?? null
    const invDesc = [inv.name, inv.description].filter(Boolean).join(" ")

    // Fix 4: Exact match — only auto-confirm when externalId is non-empty and
    // appears in either the invoice description or the bank description.
    // A broad substring match on invDesc is too prone to false positives.
    const externalId = bankTx.externalId ?? ""
    const hasRefMatch =
      externalId.length > 3 &&
      (invDesc.toLowerCase().includes(externalId.toLowerCase()) ||
        bankDesc.toLowerCase().includes(externalId.toLowerCase()))
    const amountMatch = Math.abs(bankAmount - invAmount) < 0.01
    const currencyMatch = bankCurrency === invCurrency

    // ── Score 100: Exact match ──
    if (amountMatch && currencyMatch && hasRefMatch) {
      candidates.push({
        transactionId: inv.id,
        matchType: "exact",
        confidenceScore: 100,
        status: "confirmed",
      })
      continue
    }

    // ── Score 85: Strong match ──
    if (
      Math.abs(bankAmount - invAmount) < 0.01 &&
      bankCurrency === invCurrency &&
      invDate !== null &&
      daysDiff(bankDate, invDate) <= 3
    ) {
      candidates.push({
        transactionId: inv.id,
        matchType: "strong",
        confidenceScore: 85,
        status: "suggested",
      })
      continue
    }

    // ── Score 60–80: Fuzzy match ──
    const amountTolerance = Math.abs(bankAmount) * 0.01
    if (
      Math.abs(bankAmount - invAmount) <= amountTolerance &&
      bankCurrency === invCurrency &&
      invDesc.length > 0 &&
      bankDesc.length > 0
    ) {
      const sim = similarity(bankDesc, invDesc)
      if (sim >= 0.8) {
        const score = 60 + Math.round(sim * 20)
        candidates.push({
          transactionId: inv.id,
          matchType: "fuzzy",
          confidenceScore: score,
          status: "suggested",
        })
      }
    }
  }

  if (candidates.length === 0) return 0

  // Sort by confidence descending and keep top 5
  candidates.sort((a, b) => b.confidenceScore - a.confidenceScore)
  const top5 = candidates.slice(0, 5)

  // Upsert matches: delete existing suggested, then create new ones
  // TODO: add @@unique([bankTransactionId, transactionId]) to prevent race condition on concurrent creates
  let created = 0
  for (const candidate of top5) {
    const existing = await prisma.bankTransactionMatch.findFirst({
      where: {
        bankTransactionId: bankTx.id,
        transactionId: candidate.transactionId,
      },
    })

    if (existing) {
      // Update only if new score is higher or status changed to confirmed
      if (candidate.confidenceScore > existing.confidenceScore || candidate.status === "confirmed") {
        await prisma.bankTransactionMatch.update({
          where: { id: existing.id },
          data: {
            matchType: candidate.matchType,
            confidenceScore: candidate.confidenceScore,
            status: candidate.status,
          },
        })
      }
    } else {
      await prisma.bankTransactionMatch.create({
        data: {
          bankTransactionId: bankTx.id,
          transactionId: candidate.transactionId,
          matchType: candidate.matchType,
          confidenceScore: candidate.confidenceScore,
          status: candidate.status,
        },
      })
      created++
    }
  }

  console.log(
    `✅ [MatchingEngine] bankTx=${bankTransactionId} candidates=${candidates.length} created=${created}`
  )
  return created
}

// ──────────────────────────────────────────────
// Score all unmatched bank transactions for a user against a single invoice transaction.
// Called when a new invoice transaction is saved.
// ──────────────────────────────────────────────
export async function scoreForInvoiceTransaction(invoiceTransactionId: string, userId: string): Promise<void> {
  // Fetch unconfirmed bank transactions for this user
  const bankTxs = await prisma.bankTransaction.findMany({
    where: {
      userId,
      matches: { none: { status: "confirmed" } },
    },
    select: { id: true },
  })

  // Fix 6: Pass invoiceTransactionId so each call only scores against this specific invoice,
  // not all invoices for the user.
  await Promise.allSettled(bankTxs.map((tx) => scoreForBankTransaction(tx.id, userId, invoiceTransactionId)))

  console.log(
    `✅ [MatchingEngine] invoiceTx=${invoiceTransactionId} scored against ${bankTxs.length} bank transactions`
  )
}
