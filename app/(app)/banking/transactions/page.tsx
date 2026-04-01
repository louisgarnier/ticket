import { getCurrentUser } from "@/lib/auth"
import { getBankTransactionsWithDetails, getBankTransactionWithMatches, TRANSACTIONS_PAGE_SIZE } from "@/models/banking"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Metadata } from "next"
import { Suspense } from "react"
import { TransactionRow } from "@/components/banking/transaction-row"
import ClosePanel from "@/components/banking/close-panel"

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
  searchParams: Promise<{ filter?: string; page?: string; selected?: string }>
}) {
  const params = await searchParams
  const filter: FilterParam = isValidFilter(params.filter) ? params.filter : "all"
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const selectedId = params.selected ?? null

  const user = await getCurrentUser()
  const { transactions, total, hasMore } = await getBankTransactionsWithDetails(user.id, filter, page, TRANSACTIONS_PAGE_SIZE)

  // Fetch detail for selected transaction (if any)
  const selectedDetail = selectedId
    ? await getBankTransactionWithMatches(selectedId, user.id)
    : null

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
                <Suspense key={tx.id} fallback={null}>
                  <TransactionRow
                    id={tx.id}
                    bookingDate={tx.bookingDate}
                    amount={tx.amount}
                    currency={tx.currency}
                    description={tx.description}
                    institutionName={tx.institutionName}
                    matchStatus={tx.matchStatus}
                    isAutoMatched={tx.isAutoMatched}
                    suggestionCount={tx.suggestionCount}
                    isSelected={tx.id === selectedId}
                    filter={filter}
                    page={page}
                  />
                </Suspense>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel — rendered below the table when a transaction is selected */}
      {selectedDetail && (
        <Suspense fallback={null}>
          <ClosePanel
            bankTx={{
              id: selectedDetail.id,
              amount: selectedDetail.amount,
              currency: selectedDetail.currency,
              description: selectedDetail.description ?? null,
              institutionName: selectedDetail.institutionName ?? null,
              date: selectedDetail.date,
              matches: selectedDetail.matches,
            }}
          />
        </Suspense>
      )}

      {/* Pagination */}
      {(hasMore || page > 1) && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * TRANSACTIONS_PAGE_SIZE + 1}–{Math.min(page * TRANSACTIONS_PAGE_SIZE, total)} of {total}
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
