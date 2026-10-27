import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefEarningsLedger } from "@/features/chef/components/chef-earnings-ledger";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";

export const metadata = {
  title: "Money from each order | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefOrderEarningsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Money from each order" description="What Craves paid for each delivered order." back={{ href: "/chef/earnings", label: "Earnings" }} />
        <ChefEarningsLedger />
      </ChefAccessBoundary>
    </main>
  );
}
