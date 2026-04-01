"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import { Loader2 } from "lucide-react"

function CallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState("")

  useEffect(() => {
    const bankError = searchParams.get("error")
    if (bankError) {
      setError(`Bank returned an error: ${bankError}. Please try again.`)
      return
    }

    const code = searchParams.get("code")
    if (!code) {
      setError("No authorization code received from bank.")
      return
    }

    fetch("/api/banking/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to connect bank")
        }
        router.push("/banking")
      })
      .catch((err) => {
        setError(err.message || "Something went wrong")
      })
  }, [searchParams, router])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[400px]">
        <p className="text-red-500">{error}</p>
        <a href="/banking" className="text-sm underline">
          Back to Banking
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 min-h-[400px] text-muted-foreground">
      <Loader2 className="w-10 h-10 animate-spin" />
      <p className="text-lg font-medium">Processing your bank connection...</p>
    </div>
  )
}

export default function BankingCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-10 h-10 animate-spin" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  )
}
