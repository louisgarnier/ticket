import { getCurrentUser } from "@/lib/auth"
import { getBankTransactionsWithDetails } from "@/models/banking"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Bank Transactions",
  description: "View your synced bank transactions",
}

type FilterParam = "all" | "matched" | "unmatched"

function isValidFilter(value: string | undefined): value is FilterParam {
  return value === "all" || value === "matched" || value === "unmatched"
}

export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>
}) {
  const params = await searchParams
  const filter: FilterParam = isValidFilter(params.filter) ? params.filter : "all"
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)

  const user = await getCurrentUser()
  const { transactions, total, hasMore } = await getBankTransactionsWithDetails(user.id, filter, page)

  const filterTabs: { label: string; value: FilterParam }[] = [
    { label: "All", value: "all" },
    { label: "Matched", value: "matched" },
    { label: "Unmatched", value: "unmatched" },
  ]

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/banking"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Banking
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex flex-row gap-3">
            <span className="text-3xl font-bold tracking-tight">Bank Transactions</span>
            <span className="text-3xl tracking-tight opacity-20">{total}</span>
          </h2>
        </div>
      </header>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {filterTabs.map((tab) => (
          <Link
            key={tab.value}
            href={`/banking/transactions?filter=${tab.value}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              filter === tab.value
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 min-h-[300px] text-muted-foreground border rounded-lg">
          <p className="text-lg font-medium">No transactions found</p>
          <p className="text-sm">
            {filter === "all"
              ? "No bank transactions synced yet."
              : `No ${filter} transactions found.`}{" "}
            {filter === "all" && (
              <Link href="/banking" className="underline hover:text-foreground transition-colors">
                Go to Banking to sync your accounts.
              </Link>
            )}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                  Institution
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{tx.bookingDate}</td>
                  <td
                    className={`px-4 py-3 whitespace-nowrap text-right font-mono font-medium ${
                      tx.amount < 0 ? "text-red-500" : "text-green-600"
                    }`}
                  >
                    {tx.amount < 0 ? "-" : "+"}
                    {Math.abs(tx.amount).toFixed(2)} {tx.currency}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block max-w-xs truncate" title={tx.description}>
                      {tx.description || <span className="text-muted-foreground italic">No description</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {tx.institutionName || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {tx.matchStatus === "matched" ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                        Matched
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Unmatched
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(hasMore || page > 1) && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/banking/transactions?filter=${filter}&page=${page - 1}`}
                className="px-3 py-1 border rounded hover:bg-muted transition-colors"
              >
                Previous
              </Link>
            )}
            {hasMore && (
              <Link
                href={`/banking/transactions?filter=${filter}&page=${page + 1}`}
                className="px-3 py-1 border rounded hover:bg-muted transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
