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
        <ChefPageHeader eyebrow="Your earnings" title="Earnings and payment history" description="Review earnings from paid and delivered orders alongside your older manually recorded entries. Open your available balance for the full breakdown and payment requests." />
        <ChefEarningsLedger />
      </ChefAccessBoundary>
    </main>
  );
}
