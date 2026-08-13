import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { ChefSubscriptionPlanManager } from "@/components/chef-subscription-plan-manager";

export const metadata = {
  title: "Meal plans | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefMealPlansPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <ChefPageHeader
        eyebrow="Subscriptions"
        title="Create meal plans from what you cook"
        description="Build weekly or monthly plans using only dishes from your own available menu. Submit when ready; Craves Admin reviews before customers can see the plan."
        action={
          <Link href="/chef/menu" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/30 px-4 text-sm font-semibold text-white hover:bg-white/10">
            <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
            Manage dishes
          </Link>
        }
      />
      <div className="mt-6">
        <ChefAccessBoundary>
          <ChefSubscriptionPlanManager />
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
