import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefReferrals } from "@/features/chef/components/chef-referrals";

export const metadata = {
  title: "Refer a chef | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefReferralsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Refer a chef" description="Invite home chefs and earn from their sales." back={{ href: "/chef/profile", label: "Profile" }} />
        <ChefReferrals />
      </ChefAccessBoundary>
    </main>
  );
}
