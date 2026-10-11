import Link from "next/link";
import { Gauge, UtensilsCrossed } from "lucide-react";
import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefSubscriptionPlanManager } from "@/features/chef/components/chef-subscription-plan-manager";

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
          description="Plans customers buy for a week or a month. Craves checks each plan before customers see it."
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/chef/menu" className="chef-btn is-small">
                <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
                Go to menu
              </Link>
              <Link href="/chef/capacity" className="chef-btn is-small">
                <Gauge className="h-4 w-4" aria-hidden="true" />
                Plates per day
              </Link>
            </div>
          }
        />
        <ChefSubscriptionPlanManager />
      </ChefAccessBoundary>
    </main>
  );
}
