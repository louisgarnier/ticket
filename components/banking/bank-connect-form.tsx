"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"

type Aspsp = {
  name: string
  country: string
}

export function BankConnectForm() {
  const [country, setCountry] = useState("")
  const [banks, setBanks] = useState<Aspsp[]>([])
  const [selectedBank, setSelectedBank] = useState("")
  const [loadingBanks, setLoadingBanks] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState("")

  async function fetchBanks() {
    if (!country || country.length !== 2) return
    setLoadingBanks(true)
    setError("")
    setBanks([])
    setSelectedBank("")
    try {
      const res = await fetch(`/api/banking/aspsps?country=${country.toUpperCase()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch banks")
      setBanks(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch banks")
    } finally {
      setLoadingBanks(false)
    }
  }

  async function handleConnect() {
    if (!selectedBank || !country) return
    setConnecting(true)
    setError("")
    try {
      const res = await fetch("/api/banking/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspspName: selectedBank, country: country.toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to connect")
      window.location.href = data.url
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed")
      setConnecting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-md">
      <div className="flex flex-col gap-2">
        <Label htmlFor="country">Country code (e.g. FR, DE, GB)</Label>
        <div className="flex gap-2">
          <Input
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            placeholder="FR"
            maxLength={2}
            className="w-24"
          />
          <Button variant="outline" onClick={fetchBanks} disabled={loadingBanks || country.length !== 2}>
            {loadingBanks ? "Loading..." : "Search Banks"}
          </Button>
        </div>
      </div>

      {banks.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Select your bank</Label>
          <Select value={selectedBank} onValueChange={setSelectedBank}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a bank..." />
            </SelectTrigger>
            <SelectContent>
              {banks.map((bank) => (
                <SelectItem key={bank.name} value={bank.name}>
                  {bank.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {selectedBank && (
        <Button onClick={handleConnect} disabled={connecting}>
          {connecting ? "Connecting..." : `Connect ${selectedBank}`}
        </Button>
      )}
    </div>
  )
}
