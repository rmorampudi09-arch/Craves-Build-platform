import Link from "next/link";
import { Gauge, UtensilsCrossed } from "lucide-react";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { ChefSubscriptionPlanManager } from "@/components/chef-subscription-plan-manager";

export const metadata = {
  title: "Meal plans | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefMealPlansPage() {
  return (
    <main className="chef-page">
      <ChefAccessBoundary>
        <ChefPageHeader
          title="Meal plans"
          description="Weekly or monthly plans built from dishes on your menu. Craves reviews each plan before customers can subscribe."
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/chef/menu" className="chef-btn is-small">
                <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
                Manage dishes
              </Link>
              <Link href="/chef/capacity" className="chef-btn is-small">
                <Gauge className="h-4 w-4" aria-hidden="true" />
                Capacity
              </Link>
            </div>
          }
        />
        <ChefSubscriptionPlanManager />
      </ChefAccessBoundary>
    </main>
  );
}
