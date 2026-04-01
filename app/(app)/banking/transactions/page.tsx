import { redirect } from "next/navigation"

export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string; selected?: string }>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  if (params.filter) qs.set("filter", params.filter)
  if (params.page) qs.set("page", params.page)
  if (params.selected) qs.set("selected", params.selected)
  const query = qs.toString()
  redirect(`/banking${query ? `?${query}` : ""}`)
}
