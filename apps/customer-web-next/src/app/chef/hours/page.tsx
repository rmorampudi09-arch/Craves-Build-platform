import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefOpeningHours } from "@/features/chef/components/chef-opening-hours";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";

export const metadata = {
  title: "Opening hours | Craves Chef",
  robots: { index: false, follow: false },
};

// Its own page: the hours used to sit inside "Can customers find you?" and vanished whenever that check failed.
export default function ChefHoursPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Opening hours" description="When customers can order from you." back={{ href: "/chef/profile", label: "More" }} />
        <ChefOpeningHours />
      </ChefAccessBoundary>
    </main>
  );
}
