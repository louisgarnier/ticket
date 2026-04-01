"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { MatchDetailPanel } from "@/components/banking/match-detail-panel"

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

interface ClosePanelProps {
  bankTx: BankTxDetail
}

export default function ClosePanel({ bankTx }: ClosePanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleClose() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("selected")
    router.push(`/banking?${params.toString()}`)
  }

  return <MatchDetailPanel bankTx={bankTx} onClose={handleClose} />
}
