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
    const q = searchParams.get("q")?.trim() ?? ""

    if (!q) {
      return NextResponse.json({ results: [] })
    }

    const results = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        total: true,
        currencyCode: true,
        issuedAt: true,
        description: true,
      },
      orderBy: { issuedAt: "desc" },
      take: 20,
    })

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[search-invoices] error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
