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

    // Return all unmatched bank transactions, sorted by proximity to invoice date
    const bankTransactions = await prisma.bankTransaction.findMany({
      where: {
        userId: user.id,
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
    })

    const mapped = bankTransactions.map((tx) => ({
      ...tx,
      amount: Number(tx.amount),
    }))

    // Sort by proximity to invoice date (closest first)
    if (invoice.issuedAt) {
      const referenceDate = new Date(invoice.issuedAt)
      mapped.sort((a, b) => {
        const diffA = Math.abs(new Date(a.date).getTime() - referenceDate.getTime())
        const diffB = Math.abs(new Date(b.date).getTime() - referenceDate.getTime())
        return diffA - diffB
      })
    }

    return NextResponse.json({ results: mapped })
  } catch (err) {
    console.error("[nearby-bank-transactions] error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
