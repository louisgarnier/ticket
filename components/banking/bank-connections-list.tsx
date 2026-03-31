"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Building2, RefreshCw, Trash2 } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const SYNC_PERIODS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 3 months", value: "3m" },
  { label: "Last 6 months", value: "6m" },
  { label: "Last year", value: "1y" },
]

function getDateFrom(period: string): string {
  const d = new Date()
  switch (period) {
    case "7d": d.setDate(d.getDate() - 7); break
    case "30d": d.setDate(d.getDate() - 30); break
    case "3m": d.setMonth(d.getMonth() - 3); break
    case "6m": d.setMonth(d.getMonth() - 6); break
    case "1y": d.setFullYear(d.getFullYear() - 1); break
  }
  return d.toISOString().slice(0, 10)
}

type BankConnection = {
  id: string
  accountUid: string
  accountIban: string | null
  accountName: string | null
  institutionName: string | null
  lastSynced: Date | null
}

function maskIban(iban: string | null): string {
  if (!iban) return "IBAN not available"
  if (iban.length <= 8) return iban
  return iban.slice(0, 4) + " •••• •••• " + iban.slice(-4)
}

export function BankConnectionsList({ connections }: { connections: BankConnection[] }) {
  const router = useRouter()
  const [syncing, setSyncing] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  async function handleSync(accountUid: string, dateFrom?: string) {
    setSyncing(accountUid)
    try {
      const res = await fetch("/api/banking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountUid, ...(dateFrom ? { dateFrom } : {}) }),
      })
      if (!res.ok) throw new Error("Sync failed")
      const data = await res.json()
      toast.success(`Synced ${data.synced} transactions`)
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error("Sync failed. Please try again.")
    } finally {
      setSyncing(null)
    }
  }

  async function handleDisconnect(accountUid: string) {
    setDisconnecting(accountUid)
    try {
      const res = await fetch(`/api/banking/connections/${accountUid}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Disconnect failed")
      router.refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {connections.map((conn) => (
        <Card key={conn.id}>
          <CardContent className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-5 h-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{conn.institutionName ?? "Unknown Bank"}</p>
                  {conn.accountName && (
                    <p className="text-xs text-muted-foreground truncate">{conn.accountName}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">{maskIban(conn.accountIban)}</p>
                  <p className="text-xs text-muted-foreground">
                    {conn.lastSynced
                      ? `Synced ${new Date(conn.lastSynced).toLocaleDateString()}`
                      : "Never synced"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-1 ml-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={syncing === conn.accountUid}
                  >
                    <RefreshCw className={`w-4 h-4 ${syncing === conn.accountUid ? "animate-spin" : ""}`} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SYNC_PERIODS.map((period) => (
                    <DropdownMenuItem
                      key={period.value}
                      onClick={() => handleSync(conn.accountUid, getDateFrom(period.value))}
                    >
                      {period.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDisconnect(conn.accountUid)}
                disabled={disconnecting === conn.accountUid}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
