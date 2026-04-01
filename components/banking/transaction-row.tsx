"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"

type TransactionRowProps = {
  id: string
  bookingDate: string
  amount: number
  currency: string
  description: string
  institutionName: string
  matchStatus: "matched" | "suggested" | "unmatched"
  isAutoMatched: boolean
  suggestionCount: number
  isSelected: boolean
  filter: string
  page: number
}

export function TransactionRow({
  id,
  bookingDate,
  amount,
  currency,
  description,
  institutionName,
  matchStatus,
  isAutoMatched,
  suggestionCount,
  isSelected,
  filter,
  page,
}: TransactionRowProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString())
    if (isSelected) {
      params.delete("selected")
    } else {
      params.set("selected", id)
    }
    router.push(`/banking?${params.toString()}`)
  }

  return (
    <tr
      onClick={handleClick}
      className={`cursor-pointer hover:bg-muted/30 transition-colors ${isSelected ? "bg-muted/50 border-l-2 border-l-primary" : ""}`}
    >
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{bookingDate}</td>
      <td
        className={`px-4 py-3 whitespace-nowrap text-right font-mono font-medium ${
          amount < 0 ? "text-red-500" : "text-green-600"
        }`}
      >
        {amount < 0 ? "-" : "+"}
        {Math.abs(amount).toFixed(2)} {currency}
      </td>
      <td className="px-4 py-3">
        <span className="block max-w-xs truncate" title={description}>
          {description || <span className="text-muted-foreground italic">No description</span>}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
        {institutionName || "—"}
      </td>
      <td className="px-4 py-3">
        {matchStatus === "matched" ? (
          <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
            {isAutoMatched ? "Auto-matched" : "Matched"}
          </Badge>
        ) : matchStatus === "suggested" ? (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
            {suggestionCount} suggestion{suggestionCount !== 1 ? "s" : ""}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Unmatched
          </Badge>
        )}
      </td>
    </tr>
  )
}
