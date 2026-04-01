"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Loader2, Link2 } from "lucide-react"
import { toast } from "sonner"

type InvoiceSummary = {
  id: string
  name: string | null
  total: number | null
  currencyCode: string | null
  issuedAt: Date | string | null
}

type NearbyBankTx = {
  id: string
  date: string | Date
  amount: number
  currency: string
  description: string | null
  institutionName: string | null
}

interface InvoiceMatchModalProps {
  invoice: InvoiceSummary
  open: boolean
  onClose: () => void
  onViewDetails: () => void
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—"
  return new Date(date).toISOString().slice(0, 10)
}

function formatAmount(total: number | null, currency: string | null): string {
  if (total == null) return "—"
  return `${(total / 100).toFixed(2)} ${currency ?? ""}`
}

export function InvoiceMatchModal({
  invoice,
  open,
  onClose,
  onViewDetails,
}: InvoiceMatchModalProps) {
  const router = useRouter()
  const [bankTxs, setBankTxs] = useState<NearbyBankTx[]>([])
  const [selectedBankTxId, setSelectedBankTxId] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setBankTxs([])
    setSelectedBankTxId("")

    fetch(`/api/banking/nearby-bank-transactions?invoiceId=${encodeURIComponent(invoice.id)}`)
      .then((res) => res.json())
      .then((data) => {
        const results: NearbyBankTx[] = data.results ?? []
        setBankTxs(results)
        if (results.length > 0) {
          setSelectedBankTxId(results[0].id)
        }
      })
      .catch(() => toast.error("Failed to load nearby bank transactions"))
      .finally(() => setLoading(false))
  }, [open, invoice.id])

  async function handleLink() {
    if (!selectedBankTxId) return
    setLinking(true)
    try {
      const res = await fetch(`/api/banking/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankTransactionId: selectedBankTxId,
          transactionId: invoice.id,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? "Failed to link bank transaction")
        return
      }
      toast.success("Bank transaction linked successfully")
      router.refresh()
      onClose()
    } catch {
      toast.error("Failed to link bank transaction")
    } finally {
      setLinking(false)
    }
  }

  const invoiceLabel = invoice.name ?? "Untitled"
  const invoiceAmount = formatAmount(invoice.total, invoice.currencyCode)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link Bank Transaction</DialogTitle>
        </DialogHeader>

        {/* Invoice summary */}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{invoiceLabel}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(invoice.issuedAt)} · {invoiceAmount}
          </p>
        </div>

        <Separator />

        {/* Nearby bank transactions */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Nearby bank transactions (±30 days)</p>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && bankTxs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No unmatched bank transactions found within ±30 days of this invoice.
            </p>
          )}

          {!loading && bankTxs.length > 0 && (
            <>
              <select
                value={selectedBankTxId}
                onChange={(e) => setSelectedBankTxId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {bankTxs.map((tx) => {
                  const sign = tx.amount < 0 ? "-" : "+"
                  const abs = Math.abs(tx.amount).toFixed(2)
                  const label = `${formatDate(tx.date)} — ${tx.institutionName ?? "Unknown"} — ${sign}${abs} ${tx.currency}`
                  return (
                    <option key={tx.id} value={tx.id}>
                      {label}
                    </option>
                  )
                })}
              </select>

              {selectedBankTxId && (() => {
                const tx = bankTxs.find((t) => t.id === selectedBankTxId)
                if (!tx) return null
                return (
                  <p className="text-xs text-muted-foreground truncate">
                    {tx.description ?? "No description"}
                  </p>
                )
              })()}

              <Button
                onClick={handleLink}
                disabled={!selectedBankTxId || linking}
                className="w-full"
              >
                {linking ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Lier
              </Button>
            </>
          )}
        </div>

        <Separator />

        {/* View details button */}
        <Button variant="outline" onClick={onViewDetails} className="w-full">
          Voir détails
        </Button>
      </DialogContent>
    </Dialog>
  )
}
