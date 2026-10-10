import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefCapacityQuickSetup } from "@/components/chef-capacity-quick-setup";
import { ChefPageHeader } from "@/components/chef-page-header";

export const metadata = {
  title: "Subscription availability | Craves",
  robots: { index: false, follow: false },
};

export default function ChefCapacityPage() {
  return (
    <main className="chef-page">
      <ChefAccessBoundary>
        <ChefPageHeader
          title="Meal plan capacity"
          description="How many meal-plan portions you can cook. Craves sets safe limits when you submit a plan; change them here only if you want to."
          back={{ href: "/chef/meal-plans", label: "Meal plans" }}
        />
        <ChefCapacityQuickSetup />
      </ChefAccessBoundary>
    </main>
  );
}
