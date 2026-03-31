import { getCurrentUser } from "@/lib/auth"
import { getBankConnections } from "@/models/banking"
import { BankConnectForm } from "@/components/banking/bank-connect-form"
import { Landmark } from "lucide-react"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Banking",
  description: "Connect and manage your bank accounts",
}

export default async function BankingPage() {
  const user = await getCurrentUser()
  const connections = await getBankConnections(user.id)

  return (
    <>
      <header className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Banking</h2>
      </header>

      {connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-6 min-h-[400px]">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Landmark className="w-12 h-12" />
            <p className="text-lg font-medium">No bank accounts connected yet</p>
            <p className="text-sm">Connect your bank to start reconciling transactions</p>
          </div>
          <BankConnectForm />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Connected accounts list — coming in Story 2.3 */}
          <p className="text-muted-foreground">{connections.length} account(s) connected</p>
          <BankConnectForm />
        </div>
      )}
    </>
  )
}
