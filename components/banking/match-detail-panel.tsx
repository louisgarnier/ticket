"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { X, Check, XCircle, Unlink, Search, Link2 } from "lucide-react"

type Invoice = {
  id: string
  name: string | null
  total: number | null
  currencyCode: string | null
  issuedAt: Date | null
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
  date: Date
  matches: Match[]
}

interface MatchDetailPanelProps {
  bankTx: BankTxDetail
  onClose: () => void
}

function confidenceBadgeClass(score: number): string {
  if (score >= 85) return "bg-green-100 text-green-800 border-green-200"
  if (score >= 60) return "bg-amber-100 text-amber-800 border-amber-200"
  return "bg-gray-100 text-gray-700 border-gray-200"
}

function matchTypeLabel(matchType: string): string {
  switch (matchType) {
    case "exact":
      return "Exact"
    case "strong":
      return "Strong"
    case "fuzzy":
      return "Fuzzy"
    case "manual":
      return "Manual"
    default:
      return matchType
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

export function MatchDetailPanel({ bankTx, onClose }: MatchDetailPanelProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Invoice[]>([])
  const [searching, setSearching] = useState(false)

  const confirmedMatch = bankTx.matches.find((m) => m.status === "confirmed")
  const suggestedMatches = bankTx.matches.filter((m) => m.status === "suggested").sort((a, b) => b.confidenceScore - a.confidenceScore)
  const allRejected = bankTx.matches.length > 0 && bankTx.matches.every((m) => m.status === "rejected")
  const noMatches = bankTx.matches.length === 0

  async function handleConfirm(matchId: string) {
    setLoading(matchId)
    try {
      const res = await fetch(`/api/banking/matches/${matchId}/confirm`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        console.error(`❌ [MatchDetailPanel] confirm failed:`, data)
        return
      }
      console.log(`✅ [MatchDetailPanel] confirmed matchId=${matchId}`)
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function handleReject(matchId: string) {
    setLoading(matchId + "-reject")
    try {
      const res = await fetch(`/api/banking/matches/${matchId}/reject`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        console.error(`❌ [MatchDetailPanel] reject failed:`, data)
        return
      }
      console.log(`✅ [MatchDetailPanel] rejected matchId=${matchId}`)
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function handleUnmatch(matchId: string) {
    setLoading(matchId + "-unmatch")
    try {
      const res = await fetch(`/api/banking/matches/${matchId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        console.error(`❌ [MatchDetailPanel] unmatch failed:`, data)
        return
      }
      console.log(`✅ [MatchDetailPanel] unmatched matchId=${matchId}`)
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/banking/search-invoices?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.results ?? [])
    } catch (err) {
      console.error(`❌ [MatchDetailPanel] search failed:`, err)
    } finally {
      setSearching(false)
    }
  }

  async function handleManualMatch(transactionId: string) {
    setLoading("manual-" + transactionId)
    try {
      const res = await fetch(`/api/banking/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankTransactionId: bankTx.id, transactionId }),
      })
      if (!res.ok) {
        const data = await res.json()
        console.error(`❌ [MatchDetailPanel] manual match failed:`, data)
        return
      }
      console.log(`✅ [MatchDetailPanel] manual matched bankTransactionId=${bankTx.id} transactionId=${transactionId}`)
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-background shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono font-semibold text-lg ${bankTx.amount < 0 ? "text-red-500" : "text-green-600"}`}>
              {bankTx.amount < 0 ? "-" : "+"}
              {Math.abs(bankTx.amount).toFixed(2)} {bankTx.currency}
            </span>
            <span className="text-muted-foreground text-sm">{formatDate(bankTx.date)}</span>
            {bankTx.institutionName && (
              <span className="text-muted-foreground text-sm">· {bankTx.institutionName}</span>
            )}
          </div>
          {bankTx.description && (
            <p className="text-sm text-muted-foreground mt-1">{bankTx.description}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Separator className="mb-4" />

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
                  {formatDate(confirmedMatch.invoice.issuedAt)} · {formatAmount(confirmedMatch.invoice.total, confirmedMatch.invoice.currencyCode)}
                </p>
                {confirmedMatch.invoice.description && (
                  <p className="text-xs text-muted-foreground truncate max-w-xs">{confirmedMatch.invoice.description}</p>
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
              <div key={match.id} className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
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
                      {formatDate(match.invoice.issuedAt)} · {formatAmount(match.invoice.total, match.invoice.currencyCode)}
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

      {/* Manual search — shown when no confirmed match and no suggestions left */}
      {!confirmedMatch && (noMatches || allRejected || suggestedMatches.length === 0) && (
        <div>
          <p className="text-sm font-medium mb-3">Link to an invoice manually</p>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Search by name or description…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={searching}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
              {searchResults.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.name ?? "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(inv.issuedAt)} · {formatAmount(inv.total, inv.currencyCode)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading === "manual-" + inv.id}
                    onClick={() => handleManualMatch(inv.id)}
                  >
                    <Link2 className="w-3 h-3 mr-1" />
                    Link
                  </Button>
                </div>
              ))}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-sm text-muted-foreground">No invoices found for &quot;{searchQuery}&quot;.</p>
          )}
        </div>
      )}
    </div>
  )
}
