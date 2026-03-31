import { Metadata } from "next"
import { Loader2 } from "lucide-react"

export const metadata: Metadata = {
  title: "Banking — Connecting",
}

export default function BankingCallbackPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 min-h-[400px] text-muted-foreground">
      <Loader2 className="w-10 h-10 animate-spin" />
      <p className="text-lg font-medium">Processing your bank connection...</p>
    </div>
  )
}
