import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get("invoiceId")?.trim()

    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 })
    }

    // Verify invoice belongs to user and get its date
    const invoice = await prisma.transaction.findFirst({
      where: { id: invoiceId, userId: user.id },
      select: { issuedAt: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    if (!invoice.issuedAt) {
      return NextResponse.json({ results: [] })
    }

    const referenceDate = invoice.issuedAt
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    const dateFrom = new Date(referenceDate.getTime() - thirtyDaysMs)
    const dateTo = new Date(referenceDate.getTime() + thirtyDaysMs)

    // Return unmatched bank transactions within ±30 days
    const bankTransactions = await prisma.bankTransaction.findMany({
      where: {
        userId: user.id,
        date: { gte: dateFrom, lte: dateTo },
        // Exclude those with a confirmed match
        matches: { none: { status: "confirmed" } },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        currency: true,
        description: true,
        institutionName: true,
      },
      orderBy: { date: "desc" },
      take: 20,
    })

    const results = bankTransactions.map((tx) => ({
      ...tx,
      amount: Number(tx.amount),
    }))

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[nearby-bank-transactions] error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
