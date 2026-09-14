import Link from "next/link";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefEarningsLedger } from "@/components/chef-earnings-ledger";
import { ChefPageHeader } from "@/components/chef-page-header";

export const metadata = {title: "Chef earnings | Craves", robots: {index: false, follow: false}};
export default function ChefEarningsPage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 md:px-6 md:py-8">
    <ChefPageHeader eyebrow="Finance ledger" title="Earnings and settlement status" description="Review your historical administrator-approved earning allocations. New-engine available balances and payout requests appear separately and never infer eligibility from a legacy row alone." />
    <Link href="/chef/finance" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-border px-4 py-2 text-sm font-semibold">Available balance and withdrawal requests</Link>
    {process.env.CRAVES_DOCUMENTS_WEB_ENABLED === "true" && <Link href="/chef/statements" className="ml-3 mt-5 inline-flex min-h-11 items-center rounded-xl border border-border px-4 py-2 text-sm font-semibold">PDF statements and email copies</Link>}
    <div className="mt-6"><ChefAccessBoundary><ChefEarningsLedger /></ChefAccessBoundary></div>
  </main>;
}
