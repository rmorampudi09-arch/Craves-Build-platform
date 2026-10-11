import Link from "next/link";
import { CalendarDays, UtensilsCrossed } from "lucide-react";
import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefEmpty, ChefSection } from "@/features/chef/components/chef-ui";

export const metadata = {
  title: "Meal plans | Craves Chef",
  robots: { index: false, follow: false },
};

// Meal plans are not open to chefs yet; ChefSubscriptionPlanManager returns here when they launch.
export default function ChefMealPlansPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Meal plans" back={{ href: "/chef/profile", label: "More" }} />
        <ChefSection>
          <ChefEmpty
            icon={CalendarDays}
            title="Meal plans are coming soon"
            text="Soon customers can order your food for a whole week or month. We’ll tell you when it’s ready. There’s nothing you need to do now."
            action={
              <Link href="/chef/menu" className="chef-btn is-primary is-tall w-full sm:w-auto">
                <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
                Go to my menu
              </Link>
            }
          />
        </ChefSection>
      </ChefAccessBoundary>
    </main>
  );
}
