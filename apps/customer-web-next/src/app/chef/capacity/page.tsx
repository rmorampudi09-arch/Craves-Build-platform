import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefCapacityManager } from "@/components/chef-capacity-manager";
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
        title="Control how many recurring meals you can safely prepare"
        description="Set recurring meal-slot limits, reserve only part of your kitchen capacity for subscriptions, and add date or menu-item overrides. Existing committed subscribers are never silently removed when you reduce a limit; Craves blocks new sales and raises an operations incident instead."
      />
      <div className="mt-6">
        <ChefAccessBoundary>
          <ChefCapacityManager />
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
