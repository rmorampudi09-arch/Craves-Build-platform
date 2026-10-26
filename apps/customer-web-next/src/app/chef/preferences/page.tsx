import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefOrderAlerts } from "@/features/chef/components/chef-order-alerts";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefPreferences } from "@/features/chef/components/chef-preferences";

export const metadata = {
  title: "Order settings | Craves Chef",
  robots: { index: false, follow: false },
};

// Everything about how orders reach the chef in one place: the ring and voice, then how they're answered.
export default function ChefPreferencesPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Order settings" description="How your phone tells you about orders, and how you answer them." back={{ href: "/chef/profile", label: "Profile" }} />
        <div className="chef-stack">
          <ChefOrderAlerts />
          <ChefPreferences />
        </div>
      </ChefAccessBoundary>
    </main>
  );
}
