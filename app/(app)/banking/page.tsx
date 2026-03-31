import { getCurrentUser } from "@/lib/auth"
import { getBankConnections } from "@/models/banking"
import { BankConnectForm } from "@/components/banking/bank-connect-form"
import { BankConnectionsList } from "@/components/banking/bank-connections-list"
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

      {connections.length > 0 && <BankConnectionsList connections={connections} />}

      {connections.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-6 min-h-[400px]">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Landmark className="w-12 h-12" />
            <p className="text-lg font-medium">No bank accounts connected yet</p>
            <p className="text-sm">Connect your bank to start reconciling transactions</p>
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Connect a bank account</h3>
        <BankConnectForm />
      </div>
    </>
  )
}
