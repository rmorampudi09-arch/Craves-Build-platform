import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefSubscriptionPlanManager } from "@/features/chef/components/chef-subscription-plan-manager";

export const metadata = {
  title: "Meal plans | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefMealPlansPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefSubscriptionPlanManager />
      </ChefAccessBoundary>
    </main>
  );
}
