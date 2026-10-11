import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefCapacityQuickSetup } from "@/features/chef/components/chef-capacity-quick-setup";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";

export const metadata = {
  title: "Plates per day | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefCapacityPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader
          title="Plates per day"
          description="How many meal plan plates you can cook. Craves already set safe numbers for you. Change them only if you want to."
          back={{ href: "/chef/meal-plans", label: "Meal plans" }}
        />
        <ChefCapacityQuickSetup />
      </ChefAccessBoundary>
    </main>
  );
}
