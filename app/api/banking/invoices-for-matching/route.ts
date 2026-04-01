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
    const bankTransactionDate = searchParams.get("bankTransactionDate")?.trim()

    const invoices = await prisma.transaction.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        total: true,
        currencyCode: true,
        issuedAt: true,
      },
      orderBy: { issuedAt: "desc" },
    })

    // Sort by proximity to bankTransactionDate if provided
    if (bankTransactionDate) {
      const referenceDate = new Date(bankTransactionDate)
      invoices.sort((a, b) => {
        const diffA = a.issuedAt
          ? Math.abs(new Date(a.issuedAt).getTime() - referenceDate.getTime())
          : Infinity
        const diffB = b.issuedAt
          ? Math.abs(new Date(b.issuedAt).getTime() - referenceDate.getTime())
          : Infinity
        return diffA - diffB
      })
    }

    return NextResponse.json({ results: invoices })
  } catch (err) {
    console.error("[invoices-for-matching] error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
