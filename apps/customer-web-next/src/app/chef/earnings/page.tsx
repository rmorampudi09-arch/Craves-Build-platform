import Link from "next/link";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefEarningsLedger } from "@/components/chef-earnings-ledger";
import { ChefPageHeader } from "@/components/chef-page-header";

export const metadata = {
  title: "What I've earned | Craves",
  robots: { index: false, follow: false },
};

export default function ChefEarningsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <ChefAccessBoundary>
        <ChefPageHeader
          eyebrow="Your earnings"
          title="Earnings and payment history"
          description="Review earnings from paid and delivered orders alongside your older manually recorded entries. Your available balance has the full breakdown and payment requests."
          action={<Link href="/chef/finance" className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#E5E7EB] bg-white px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#F1F3F5] sm:w-auto">Open your available balance</Link>}
        />
        <ChefEarningsLedger />
      </ChefAccessBoundary>
    </main>
  );
}
