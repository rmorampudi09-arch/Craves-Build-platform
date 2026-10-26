import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefDailyLimits } from "@/features/chef/components/chef-daily-limits";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { isUuid } from "@/shared/lib/server-api";

export const metadata = {
  title: "Daily limits | Craves Chef",
  robots: { index: false, follow: false },
};

// ?plan= comes from a plan card (&from=menu when it is in the Menu tab): only that plan's days count.
// Without it, the Menu tab (?from=menu) or More opened the page.
export default async function ChefCapacityPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[]; from?: string | string[] }> }) {
  const { plan, from } = await searchParams;
  const planId = typeof plan === "string" && isUuid(plan) ? plan : null;
  const back = planId
    ? from === "menu" ? { href: "/chef/menu?view=plans", label: "Menu" } : { href: "/chef/meal-plans", label: "Meal plans" }
    : from === "menu" ? { href: "/chef/menu", label: "Menu" } : { href: "/chef/profile", label: "Profile" };
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Daily limits" description="How many plates you can cook" back={back} />
        <ChefDailyLimits planId={planId} />
      </ChefAccessBoundary>
    </main>
  );
}
