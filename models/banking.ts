import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"

export const TRANSACTIONS_PAGE_SIZE = 50

// BankConnection

export async function createBankConnection(data: {
  userId: string
  sessionId: string
  accountUid: string
  accountIban?: string
  accountName?: string
  institutionName?: string
}) {
  return prisma.bankConnection.upsert({
    where: { accountUid: data.accountUid },
    create: data,
    update: {
      sessionId: data.sessionId,
      accountIban: data.accountIban,
      accountName: data.accountName,
      institutionName: data.institutionName,
    },
  })
}

export async function getBankConnections(userId: string) {
  return prisma.bankConnection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })
}

export async function deleteBankConnection(accountUid: string, userId: string) {
  return prisma.bankConnection.delete({
    where: { accountUid, userId },
  })
}

export async function updateBankConnectionLastSynced(accountUid: string) {
  return prisma.bankConnection.update({
    where: { accountUid },
    data: { lastSynced: new Date() },
  })
}

// BankTransaction

export async function createBankTransactionsBulk(
  transactions: {
    userId: string
    accountUid: string
    externalId: string
    idempotencyKey: string
    date: Date
    amount: Prisma.Decimal | number
    currency: string
    description?: string
    institutionName?: string
    rawData?: Prisma.InputJsonValue
  }[]
) {
  const results = await Promise.allSettled(
    transactions.map((tx) =>
      prisma.bankTransaction.upsert({
        where: { idempotencyKey: tx.idempotencyKey },
        create: tx,
        update: {},
      })
    )
  )
  const inserted = results.filter((r) => r.status === "fulfilled").length
  return { inserted, total: transactions.length }
}

export async function getBankTransactions(
  userId: string,
  filters?: { accountUid?: string; matchStatus?: string }
) {
  return prisma.bankTransaction.findMany({
    where: {
      userId,
      ...(filters?.accountUid ? { accountUid: filters.accountUid } : {}),
    },
    include: {
      matches: true,
    },
    orderBy: { date: "desc" },
  })
}

export async function getBankTransactionsWithDetails(
  userId: string,
  filter: "all" | "matched" | "unmatched" = "all",
  page: number = 1,
  limit: number = TRANSACTIONS_PAGE_SIZE
) {
  const offset = (page - 1) * limit

  const where: Prisma.BankTransactionWhereInput = { userId }

  if (filter === "matched") {
    where.matches = { some: { status: "confirmed" } }
  } else if (filter === "unmatched") {
    // "unmatched" means no confirmed match exists — this intentionally includes transactions
    // with zero match records AND transactions with only suggested/rejected matches.
    where.matches = { none: { status: "confirmed" } }
  }

  const [transactions, total] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      include: {
        // Fetch both confirmed and suggested matches to compute status and suggestion count.
        matches: {
          where: { status: { in: ["confirmed", "suggested"] } },
          select: { status: true, matchType: true },
        },
      },
      orderBy: { date: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.bankTransaction.count({ where }),
  ])

  return {
    transactions: transactions.map((tx) => {
      const confirmedCount = tx.matches.filter((m) => m.status === "confirmed").length
      const suggestedCount = tx.matches.filter((m) => m.status === "suggested").length
      const matchStatus =
        confirmedCount > 0 ? ("matched" as const) : suggestedCount > 0 ? ("suggested" as const) : ("unmatched" as const)
      const isAutoMatched = tx.matches.some((m) => m.status === "confirmed" && m.matchType === "exact")
      return {
        id: tx.id,
        externalId: tx.externalId,
        amount: Number(tx.amount),
        currency: tx.currency,
        bookingDate: tx.date.toISOString().slice(0, 10),
        description: tx.description ?? "",
        institutionName: tx.institutionName ?? "",
        matchStatus,
        isAutoMatched,
        suggestionCount: matchStatus === "suggested" ? suggestedCount : 0,
      }
    }),
    total,
    page,
    hasMore: offset + limit < total,
  }
}

// BankTransactionMatch

export async function createBankTransactionMatch(data: {
  bankTransactionId: string
  transactionId?: string
  fileId?: string
  matchType: string
  confidenceScore: number
  status?: string
}) {
  return prisma.bankTransactionMatch.create({ data })
}

export async function getBankTransactionMatches(bankTransactionId: string) {
  return prisma.bankTransactionMatch.findMany({
    where: { bankTransactionId },
    orderBy: { confidenceScore: "desc" },
  })
}

export async function getBankTransactionWithMatches(bankTransactionId: string, userId: string) {
  const bankTx = await prisma.bankTransaction.findFirst({
    where: { id: bankTransactionId, userId },
    include: {
      matches: {
        orderBy: { confidenceScore: "desc" },
      },
    },
  })

  if (!bankTx) return null

  // Fetch linked Transaction (invoice) details for each match that has a transactionId
  const transactionIds = bankTx.matches
    .filter((m) => m.transactionId)
    .map((m) => m.transactionId as string)

  const invoices =
    transactionIds.length > 0
      ? await prisma.transaction.findMany({
          where: { id: { in: transactionIds }, userId },
          select: { id: true, name: true, total: true, currencyCode: true, issuedAt: true, description: true },
        })
      : []

  const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]))

  return {
    ...bankTx,
    amount: Number(bankTx.amount),
    matches: bankTx.matches.map((m) => ({
      ...m,
      invoice: m.transactionId ? (invoiceMap.get(m.transactionId) ?? null) : null,
    })),
  }
}
