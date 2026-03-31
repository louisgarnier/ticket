import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"

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
