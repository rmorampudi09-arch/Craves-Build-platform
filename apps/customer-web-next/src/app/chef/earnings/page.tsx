import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefEarningsLedger } from "@/features/chef/components/chef-earnings-ledger";
import { ChefMoneyLinks } from "@/features/chef/components/chef-money-links";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefWithdrawalPanel } from "@/features/chef/components/chef-withdrawal-panel";

export const metadata = {
  title: "Earnings | Craves Chef",
  robots: { index: false, follow: false },
};

// What a chef can take out comes first; the rows at the end lead to the other money pages.
export default function ChefEarningsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Earnings" description="What you earned and what you can take out." />
        <div className="chef-stack">
          <ChefWithdrawalPanel compact />
          <ChefEarningsLedger sales />
          <ChefMoneyLinks />
        </div>
      </ChefAccessBoundary>
    </main>
  );
}
