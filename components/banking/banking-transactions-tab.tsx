"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Check, XCircle, Unlink, Link2, Loader2 } from "lucide-react"
import { toast } from "sonner"

type Transaction = {
  id: string
  bookingDate: string
  amount: number
  currency: string
  description: string
  institutionName: string
  matchStatus: "matched" | "suggested" | "unmatched"
  isAutoMatched: boolean
  suggestionCount: number
}

type Invoice = {
  id: string
  name: string | null
  total: number | null
  currencyCode: string | null
  issuedAt: Date | string | null
  description: string | null
}

type Match = {
  id: string
  matchType: string
  confidenceScore: number
  status: string
  invoice: Invoice | null
}

type BankTxDetail = {
  id: string
  amount: number
  currency: string
  description: string | null
  institutionName: string | null
  date: Date | string
  matches: Match[]
}

interface BankingTransactionsTabProps {
  transactions: Transaction[]
}

function confidenceBadgeClass(score: number): string {
  if (score >= 85) return "bg-green-100 text-green-800 border-green-200"
  if (score >= 60) return "bg-amber-100 text-amber-800 border-amber-200"
  return "bg-gray-100 text-gray-700 border-gray-200"
}

function matchTypeLabel(matchType: string): string {
  switch (matchType) {
    case "exact": return "Exact"
    case "strong": return "Strong"
    case "fuzzy": return "Fuzzy"
    case "manual": return "Manual"
    default: return matchType
  }
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—"
  return new Date(date).toISOString().slice(0, 10)
}

function formatAmount(total: number | null, currency: string | null): string {
  if (total == null) return "—"
  return `${(total / 100).toFixed(2)} ${currency ?? ""}`
}

function MatchModalBody({
  detail,
  onAction,
}: {
  detail: BankTxDetail
  onAction: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("")
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  const confirmedMatch = detail.matches.find((m) => m.status === "confirmed")
  const suggestedMatches = detail.matches
    .filter((m) => m.status === "suggested")
    .sort((a, b) => b.confidenceScore - a.confidenceScore)

  // Fetch all invoices sorted by proximity to this bank transaction's date
  useEffect(() => {
    if (confirmedMatch) return
    setLoadingInvoices(true)
    const dateParam = formatDate(detail.date)
    fetch(`/api/banking/invoices-for-matching?bankTransactionDate=${encodeURIComponent(dateParam)}`)
      .then((res) => res.json())
      .then((data) => {
        const results: Invoice[] = data.results ?? []
        setInvoices(results)
        if (results.length > 0) {
          setSelectedInvoiceId(results[0].id)
        }
      })
      .catch(() => toast.error("Failed to load invoices"))
      .finally(() => setLoadingInvoices(false))
  }, [detail.id, detail.date, confirmedMatch])

  async function handleConfirm(matchId: string) {
    setLoading(matchId)
    try {
      const res = await fetch(`/api/banking/matches/${matchId}/confirm`, { method: "POST" })
      if (!res.ok) {
        toast.error("Failed to confirm match")
        return
      }
      toast.success("Match confirmed")
      router.refresh()
      onAction()
    } finally {
      setLoading(null)
    }
  }

  async function handleReject(matchId: string) {
    setLoading(matchId + "-reject")
    try {
      const res = await fetch(`/api/banking/matches/${matchId}/reject`, { method: "POST" })
      if (!res.ok) {
        toast.error("Failed to reject match")
        return
      }
      toast.success("Match rejected")
      router.refresh()
      onAction()
    } finally {
      setLoading(null)
    }
  }

  async function handleUnmatch(matchId: string) {
    setLoading(matchId + "-unmatch")
    try {
      const res = await fetch(`/api/banking/matches/${matchId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to unmatch")
        return
      }
      toast.success("Unmatched successfully")
      router.refresh()
      onAction()
    } finally {
      setLoading(null)
    }
  }

  async function handleManualMatch() {
    if (!selectedInvoiceId) return
    setLoading("manual-" + selectedInvoiceId)
    try {
      const res = await fetch(`/api/banking/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankTransactionId: detail.id, transactionId: selectedInvoiceId }),
      })
      if (!res.ok) {
        toast.error("Failed to link invoice")
        return
      }
      toast.success("Invoice linked successfully")
      router.refresh()
      onAction()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bank transaction info */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`font-mono font-semibold text-lg ${
              detail.amount < 0 ? "text-red-500" : "text-green-600"
            }`}
          >
            {detail.amount < 0 ? "-" : "+"}
            {Math.abs(detail.amount).toFixed(2)} {detail.currency}
          </span>
          <span className="text-muted-foreground text-sm">{formatDate(detail.date)}</span>
          {detail.institutionName && (
            <span className="text-muted-foreground text-sm">· {detail.institutionName}</span>
          )}
        </div>
        {detail.description && (
          <p className="text-sm text-muted-foreground mt-1">{detail.description}</p>
        )}
      </div>

      <Separator />

      {/* Confirmed match */}
      {confirmedMatch && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
              {confirmedMatch.matchType === "exact" ? "Auto-matched" : "Matched"}
            </Badge>
            <span className="text-sm text-muted-foreground">{matchTypeLabel(confirmedMatch.matchType)}</span>
          </div>
          {confirmedMatch.invoice ? (
            <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">{confirmedMatch.invoice.name ?? "Untitled"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(confirmedMatch.invoice.issuedAt)} ·{" "}
                  {formatAmount(confirmedMatch.invoice.total, confirmedMatch.invoice.currencyCode)}
                </p>
                {confirmedMatch.invoice.description && (
                  <p className="text-xs text-muted-foreground truncate max-w-xs">
                    {confirmedMatch.invoice.description}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={loading === confirmedMatch.id + "-unmatch"}
                onClick={() => handleUnmatch(confirmedMatch.id)}
              >
                <Unlink className="w-3 h-3 mr-1" />
                Unmatch
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Invoice details unavailable.</p>
          )}
        </div>
      )}

      {/* Suggested matches */}
      {!confirmedMatch && suggestedMatches.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Suggestions</p>
          <div className="flex flex-col gap-2">
            {suggestedMatches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{match.invoice?.name ?? "Untitled"}</p>
                    <Badge className={`text-xs ${confidenceBadgeClass(match.confidenceScore)}`}>
                      {match.confidenceScore}%
                    </Badge>
                    <span className="text-xs text-muted-foreground">{matchTypeLabel(match.matchType)}</span>
                  </div>
                  {match.invoice && (
                    <p className="text-xs text-muted-foreground">
                      {formatDate(match.invoice.issuedAt)} ·{" "}
                      {formatAmount(match.invoice.total, match.invoice.currencyCode)}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    disabled={loading === match.id}
                    onClick={() => handleConfirm(match.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading === match.id + "-reject"}
                    onClick={() => handleReject(match.id)}
                  >
                    <XCircle className="w-3 h-3 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual match dropdown */}
      {!confirmedMatch && (
        <div>
          <p className="text-sm font-medium mb-3">Link to an invoice manually</p>

          {loadingInvoices && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingInvoices && invoices.length === 0 && (
            <p className="text-sm text-muted-foreground">No invoices available.</p>
          )}

          {!loadingInvoices && invoices.length > 0 && (
            <>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mb-3"
              >
                {invoices.map((inv) => {
                  const name = (inv.name ?? "Untitled").slice(0, 30)
                  const label = `${formatDate(inv.issuedAt)} — ${name} — ${formatAmount(inv.total, inv.currencyCode)}`
                  return (
                    <option key={inv.id} value={inv.id}>
                      {label}
                    </option>
                  )
                })}
              </select>

              <Button
                size="sm"
                disabled={!selectedInvoiceId || loading === "manual-" + selectedInvoiceId}
                onClick={handleManualMatch}
                className="w-full"
              >
                {loading === "manual-" + selectedInvoiceId ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Link2 className="w-3 h-3 mr-1" />
                )}
                Lier
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function BankingTransactionsTab({ transactions }: BankingTransactionsTabProps) {
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null)
  const [detail, setDetail] = useState<BankTxDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const fetchDetail = useCallback(async (id: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/banking/matches/bank-transaction/${id}`)
      if (!res.ok) {
        toast.error("Failed to load transaction details")
        return
      }
      const data = await res.json()
      setDetail(data)
    } catch {
      toast.error("Failed to load transaction details")
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  function handleRowClick(id: string) {
    setSelectedTxId(id)
    setDetail(null)
    fetchDetail(id)
  }

  function handleClose() {
    setSelectedTxId(null)
    setDetail(null)
  }

  function handleAction() {
    if (selectedTxId) {
      fetchDetail(selectedTxId)
    }
  }

  if (transactions.length === 0) {
    return null
  }

  return (
    <>
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
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
              <tr
                key={tx.id}
                onClick={() => handleRowClick(tx.id)}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
              >
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
                    {tx.description || (
                      <span className="text-muted-foreground italic">No description</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                  {tx.institutionName || "—"}
                </td>
                <td className="px-4 py-3">
                  {tx.matchStatus === "matched" ? (
                    <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                      {tx.isAutoMatched ? "Auto-matched" : "Matched"}
                    </Badge>
                  ) : tx.matchStatus === "suggested" ? (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
                      {tx.suggestionCount} suggestion{tx.suggestionCount !== 1 ? "s" : ""}
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

      <Dialog open={!!selectedTxId} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>

          {loadingDetail && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingDetail && detail && (
            <MatchModalBody detail={detail} onAction={handleAction} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
