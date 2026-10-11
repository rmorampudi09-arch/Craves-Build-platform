import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefBankOnboardingPanel } from "@/features/chef/components/chef-bank-onboarding-panel";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";

export const metadata = { title: "Bank account | Craves Chef", robots: { index: false, follow: false } };

export default function ChefBankPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Bank account" back={{ href: "/chef/profile", label: "More" }} />
        <ChefBankOnboardingPanel titled={false} />
      </ChefAccessBoundary>
    </main>
  );
}
