import { getCurrentUser } from "@/lib/auth"
import { getBankConnections, getBankTransactionsWithDetails, getBankTransactionWithMatches } from "@/models/banking"
import { BankConnectForm } from "@/components/banking/bank-connect-form"
import { BankConnectionsList } from "@/components/banking/bank-connections-list"
import { Landmark } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { TransactionRow } from "@/components/banking/transaction-row"
import ClosePanel from "@/components/banking/close-panel"

export const metadata: Metadata = {
  title: "Banking",
  description: "Connect and manage your bank accounts",
}

type FilterParam = "all" | "matched" | "unmatched" | "pending"

function isValidFilter(value: string | undefined): value is FilterParam {
  return value === "all" || value === "matched" || value === "unmatched" || value === "pending"
}

function isValidLimit(value: number): value is 50 | 100 | 200 | 500 {
  return value === 50 || value === 100 || value === 200 || value === 500
}

export default async function BankingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string; page?: string; selected?: string; limit?: string }>
}) {
  const params = await searchParams
  const tab = params.tab === "config" ? "config" : "transactions"
  const filter: FilterParam = isValidFilter(params.filter) ? params.filter : "all"
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const selectedId = params.selected ?? null
  const rawLimit = parseInt(params.limit ?? "50", 10)
  const limit = isValidLimit(rawLimit) ? rawLimit : 50

  const user = await getCurrentUser()

  const filterTabs: { label: string; value: FilterParam }[] = [
    { label: "All", value: "all" },
    { label: "Matched", value: "matched" },
    { label: "Pending", value: "pending" },
    { label: "Unmatched", value: "unmatched" },
  ]

  // Tab navigation pills
  const tabNav = (
    <div className="flex gap-2">
      <Link
        href="/banking"
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
          tab === "transactions"
            ? "bg-foreground text-background border-foreground"
            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
        }`}
      >
        Transactions
      </Link>
      <Link
        href="/banking?tab=config"
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
          tab === "config"
            ? "bg-foreground text-background border-foreground"
            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
        }`}
      >
        Config
      </Link>
    </div>
  )

  if (tab === "config") {
    const connections = await getBankConnections(user.id)

    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-3xl font-bold tracking-tight">Banking</h2>
        </header>

        {tabNav}

        <div className="flex gap-6 items-start">
          {/* Left: connections list */}
          <div className="flex-1 min-w-0 flex flex-col gap-4 mr-80">
            {connections.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 min-h-[300px] text-muted-foreground border rounded-lg">
                <Landmark className="w-12 h-12" />
                <p className="text-lg font-medium">No bank accounts connected yet</p>
                <p className="text-sm">Connect your bank using the panel on the right</p>
              </div>
            ) : (
              <BankConnectionsList connections={connections} />
            )}
          </div>

          {/* Right: connect form — fixed */}
          <div className="w-72 shrink-0 fixed top-4 right-4 bg-background z-10">
            <div className="border rounded-lg p-4 flex flex-col gap-4 shadow-sm">
              <h3 className="text-base font-semibold">Connect a bank account</h3>
              <BankConnectForm />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Transactions tab
  const { transactions, total, hasMore } = await getBankTransactionsWithDetails(user.id, filter, page, limit)

  const selectedDetail = selectedId
    ? await getBankTransactionWithMatches(selectedId, user.id)
    : null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex flex-row gap-3">
          <span className="text-3xl font-bold tracking-tight">Banking</span>
          <span className="text-3xl tracking-tight opacity-20">{total}</span>
        </h2>
      </header>

      {tabNav}

      {/* Filter tabs + rows-per-page selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {filterTabs.map((t) => (
            <Link
              key={t.value}
              href={`/banking?filter=${t.value}&limit=${limit}`}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                filter === t.value
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Show</span>
          {[50, 100, 200, 500].map((n) => (
            <Link
              key={n}
              href={`/banking?filter=${filter}&limit=${n}`}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                limit === n
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:border-foreground"
              }`}
            >
              {n}
            </Link>
          ))}
        </div>
      </div>

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 min-h-[300px] text-muted-foreground border rounded-lg">
          <p className="text-lg font-medium">No transactions found</p>
          <p className="text-sm">
            {filter === "all"
              ? "No bank transactions synced yet."
              : filter === "pending"
              ? "No transactions with pending suggestions."
              : `No ${filter} transactions found.`}{" "}
            {filter === "all" && (
              <Link href="/banking?tab=config" className="underline hover:text-foreground transition-colors">
                Go to Config to connect your accounts.
              </Link>
            )}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto max-h-[calc(100vh-340px)]">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
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

      {/* Detail panel */}
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
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/banking?filter=${filter}&page=${page - 1}&limit=${limit}`}
                className="px-3 py-1 border rounded hover:bg-muted transition-colors"
              >
                Previous
              </Link>
            )}
            {hasMore && (
              <Link
                href={`/banking?filter=${filter}&page=${page + 1}&limit=${limit}`}
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
