import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefMenuManager } from "@/features/chef/components/chef-menu-manager";
import { ChefSubscriptionPlanManager } from "@/features/chef/components/chef-subscription-plan-manager";

export const metadata = {
  title: "My menu | Craves",
  robots: { index: false, follow: false },
};

export default async function ChefMenuPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const plans = (await searchParams).view === "plans";
  // Narrow list; on wide screens the dish form gets room for its customer preview.
  return (
    <main className={plans ? "chef-page is-narrow" : "chef-page is-narrow lg:!max-w-[66rem]"}>
      <ChefAccessBoundary>{plans ? <ChefSubscriptionPlanManager inMenu /> : <ChefMenuManager />}</ChefAccessBoundary>
    </main>
  );
}
