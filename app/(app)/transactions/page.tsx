import { ExportTransactionsDialog } from "@/components/export/transactions"
import { UploadButton } from "@/components/files/upload-button"
import { TransactionSearchAndFilters } from "@/components/transactions/filters"
import { InvoiceList } from "@/components/banking/invoice-list"
import { NewTransactionDialog } from "@/components/transactions/new"
import { Pagination } from "@/components/transactions/pagination"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getCategories } from "@/models/categories"
import { getFields } from "@/models/fields"
import { getProjects } from "@/models/projects"
import { getTransactions, TransactionFilters } from "@/models/transactions"
import { Download, Plus, Upload } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Invoices",
  description: "Manage your invoices",
}

const TRANSACTIONS_PER_PAGE = 500

type BankMatchTab = "all" | "matched" | "pending"

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<TransactionFilters & { bankMatch?: string }> }) {
  const { page, bankMatch: rawBankMatch, ...filters } = await searchParams
  const bankMatch: BankMatchTab =
    rawBankMatch === "matched" || rawBankMatch === "pending" ? rawBankMatch : "all"
  const user = await getCurrentUser()

  // For matched/pending tabs, pre-fetch the relevant invoice IDs from BankTransactionMatch
  let idIn: string[] | undefined
  if (bankMatch === "matched") {
    const rows = await prisma.bankTransactionMatch.findMany({
      where: { status: "confirmed", transactionId: { not: null }, bankTransaction: { userId: user.id } },
      select: { transactionId: true },
    })
    idIn = rows.map((r) => r.transactionId!).filter(Boolean)
    if (idIn.length === 0) idIn = ["__none__"] // force empty result
  } else if (bankMatch === "pending") {
    const confirmedRows = await prisma.bankTransactionMatch.findMany({
      where: { status: "confirmed", transactionId: { not: null }, bankTransaction: { userId: user.id } },
      select: { transactionId: true },
    })
    const confirmedIds = new Set(confirmedRows.map((r) => r.transactionId!).filter(Boolean))
    const suggestedRows = await prisma.bankTransactionMatch.findMany({
      where: { status: "suggested", transactionId: { not: null }, bankTransaction: { userId: user.id } },
      select: { transactionId: true },
    })
    idIn = [...new Set(suggestedRows.map((r) => r.transactionId!).filter(Boolean))]
      .filter((id) => !confirmedIds.has(id))
    if (idIn.length === 0) idIn = ["__none__"]
  }

  const { transactions, total } = await getTransactions(user.id, { ...filters, idIn }, {
    limit: TRANSACTIONS_PER_PAGE,
    offset: ((page ?? 1) - 1) * TRANSACTIONS_PER_PAGE,
  })
  const categories = await getCategories(user.id)
  const projects = await getProjects(user.id)
  const fields = await getFields(user.id)

  // Reset page if user clicks a filter and no transactions are found
  if (page && page > 1 && transactions.length === 0) {
    const params = new URLSearchParams(filters as Record<string, string>)
    redirect(`?${params.toString()}`)
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Invoices</span>
          <span className="text-3xl tracking-tight opacity-20">{total}</span>
        </h2>
        <div className="flex gap-2">
          <ExportTransactionsDialog fields={fields} categories={categories} projects={projects} total={total}>
            <Download /> <span className="hidden md:block">Export</span>
          </ExportTransactionsDialog>
          <NewTransactionDialog>
            <Plus /> <span className="hidden md:block">Add Transaction</span>
          </NewTransactionDialog>
        </div>
      </header>

      {/* Bank match filter tabs */}
      <div className="flex gap-2 mb-2">
        {(["all", "matched", "pending"] as BankMatchTab[]).map((tab) => (
          <Link
            key={tab}
            href={tab === "all" ? "/transactions" : `/transactions?bankMatch=${tab}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              bankMatch === tab
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
            }`}
          >
            {tab === "all" ? "All" : tab === "matched" ? "Matched" : "Pending"}
          </Link>
        ))}
      </div>

      <TransactionSearchAndFilters categories={categories} projects={projects} fields={fields} />

      <main>
        <InvoiceList transactions={transactions} fields={fields} />

        {total > TRANSACTIONS_PER_PAGE && <Pagination totalItems={total} itemsPerPage={TRANSACTIONS_PER_PAGE} />}

        {transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[400px]">
            <p className="text-muted-foreground">
              You don&apos;t seem to have any transactions yet. Let&apos;s start and create the first one!
            </p>
            <div className="flex flex-row gap-5 mt-8">
              <UploadButton>
                <Upload /> Analyze New Invoice
              </UploadButton>
              <NewTransactionDialog>
                <Button variant="outline">
                  <Plus />
                  Add Manually
                </Button>
              </NewTransactionDialog>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
