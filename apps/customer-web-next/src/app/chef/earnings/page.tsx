import Link from "next/link";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefEarningsLedger } from "@/components/chef-earnings-ledger";
import { ChefPageHeader } from "@/components/chef-page-header";

export const metadata = {
  title: "Earnings | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefEarningsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader
          title="Earnings"
          description="Money from your delivered orders."
          action={<Link href="/chef/finance" className="chef-btn is-small">Balance &amp; payouts</Link>}
        />
        <ChefEarningsLedger />
      </ChefAccessBoundary>
    </main>
  );
}
