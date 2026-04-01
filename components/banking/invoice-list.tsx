"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Transaction, Field } from "@/prisma/client"
import { TransactionList } from "@/components/transactions/list"
import { InvoiceMatchModal } from "@/components/banking/invoice-match-modal"

interface InvoiceListProps {
  transactions: Transaction[]
  fields?: Field[]
}

export function InvoiceList({ transactions, fields = [] }: InvoiceListProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Transaction | null>(null)

  function handleRowClick(transaction: Transaction) {
    setSelectedInvoice(transaction)
    setModalOpen(true)
  }

  function handleClose() {
    setModalOpen(false)
    setSelectedInvoice(null)
  }

  function handleViewDetails() {
    if (selectedInvoice) {
      router.push(`/transactions/${selectedInvoice.id}`)
    }
    setModalOpen(false)
    setSelectedInvoice(null)
  }

  return (
    <>
      <TransactionList
        transactions={transactions}
        fields={fields}
        onRowClick={handleRowClick}
      />

      {selectedInvoice && (
        <InvoiceMatchModal
          invoice={{
            id: selectedInvoice.id,
            name: selectedInvoice.name ?? null,
            total: selectedInvoice.total ?? null,
            currencyCode: selectedInvoice.currencyCode ?? null,
            issuedAt: selectedInvoice.issuedAt ?? null,
          }}
          open={modalOpen}
          onClose={handleClose}
          onViewDetails={handleViewDetails}
        />
      )}
    </>
  )
}
