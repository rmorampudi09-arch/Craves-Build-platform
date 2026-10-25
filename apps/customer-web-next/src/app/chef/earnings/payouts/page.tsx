import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefPayoutHistory } from "@/features/chef/components/chef-payout-history";

export const metadata = {
  title: "Payout history | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefPayoutHistoryPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Payout history" description="Money sent to your bank." back={{ href: "/chef/earnings", label: "Money" }} />
        <ChefPayoutHistory />
      </ChefAccessBoundary>
    </main>
  );
}
