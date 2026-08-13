import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefCapacityManager } from "@/components/chef-capacity-manager";
import { ChefCapacityQuickSetup } from "@/components/chef-capacity-quick-setup";
import { ChefPageHeader } from "@/components/chef-page-header";

export const metadata = {
  title: "Subscription capacity | Craves",
  robots: { index: false, follow: false },
};

export default function ChefCapacityPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <ChefPageHeader
        eyebrow="Subscription capacity"
        title="Tell Craves how many subscription meals you can safely prepare"
        description="Start with Quick setup. Choose the same meal slot used in your meal plan and apply it to all 7 weekdays for monthly plans. Advanced capacity controls remain below for date-specific and menu-item limits."
      />
      <div className="mt-6">
        <ChefAccessBoundary>
          <div className="space-y-6">
            <ChefCapacityQuickSetup />
            <section>
              <div className="mb-3">
                <h2 className="font-display text-xl font-bold text-ink">Advanced capacity controls</h2>
                <p className="mt-1 text-sm text-muted-foreground">Use these only when you need weekday-specific rules, date overrides or menu-item limits.</p>
              </div>
              <ChefCapacityManager />
            </section>
          </div>
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
