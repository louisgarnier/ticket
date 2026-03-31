"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, RefreshCw, Trash2 } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"

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

  async function handleSync(accountUid: string) {
    setSyncing(accountUid)
    try {
      const res = await fetch("/api/banking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountUid }),
      })
      if (!res.ok) throw new Error("Sync failed")
      router.refresh()
    } catch (err) {
      console.error(err)
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
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="font-medium">{conn.institutionName ?? conn.accountName ?? "Unknown Bank"}</p>
                <p className="text-sm text-muted-foreground">{maskIban(conn.accountIban)}</p>
                <p className="text-xs text-muted-foreground">
                  {conn.lastSynced
                    ? `Last synced: ${new Date(conn.lastSynced).toLocaleDateString()}`
                    : "Never synced"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSync(conn.accountUid)}
                disabled={syncing === conn.accountUid}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${syncing === conn.accountUid ? "animate-spin" : ""}`} />
                Sync
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDisconnect(conn.accountUid)}
                disabled={disconnecting === conn.accountUid}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
