import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefDailyLimits } from "@/features/chef/components/chef-daily-limits";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { isUuid } from "@/shared/lib/server-api";

export const metadata = {
  title: "Daily limits | Craves Chef",
  robots: { index: false, follow: false },
};

// ?plan= comes from a plan card: only that plan's days count.
export default async function ChefCapacityPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[] }> }) {
  const { plan } = await searchParams;
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Daily limits" description="How many plates you can cook" back={{ href: "/chef/meal-plans", label: "Meal plans" }} />
        <ChefDailyLimits planId={typeof plan === "string" && isUuid(plan) ? plan : null} />
      </ChefAccessBoundary>
    </main>
  );
}
