import { getCurrentUser } from "@/lib/auth"
import { getBankConnections } from "@/models/banking"
import { BankConnectForm } from "@/components/banking/bank-connect-form"
import { BankConnectionsList } from "@/components/banking/bank-connections-list"
import { Landmark } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Banking",
  description: "Connect and manage your bank accounts",
}

export default async function BankingPage() {
  const user = await getCurrentUser()
  const connections = await getBankConnections(user.id)

  return (
    <div className="flex gap-6 items-start">
      {/* Left: main content — reserves space so fixed panel doesn't overlap */}
      <div className="flex-1 min-w-0 flex flex-col gap-4 mr-80">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-3xl font-bold tracking-tight">Banking</h2>
          <Link
            href="/banking/transactions"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View Transactions →
          </Link>
        </header>

        {connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 min-h-[300px] text-muted-foreground border rounded-lg">
            <Landmark className="w-12 h-12" />
            <p className="text-lg font-medium">No bank accounts connected yet</p>
            <p className="text-sm">Connect your bank using the panel on the right</p>
          </div>
        ) : (
          <BankConnectionsList connections={connections} />
        )}
      </div>

      {/* Right: connect form — fixed, with background so it doesn't bleed */}
      <div className="w-72 shrink-0 fixed top-4 right-4 bg-background z-10">
        <div className="border rounded-lg p-4 flex flex-col gap-4 shadow-sm">
          <h3 className="text-base font-semibold">Connect a bank account</h3>
          <BankConnectForm />
        </div>
      </div>
    </div>
  )
}
