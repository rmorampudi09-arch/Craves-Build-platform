import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefMenuManager } from "@/components/chef-menu-manager";
import { ChefPageHeader } from "@/components/chef-page-header";

export const metadata = {
  title: "Chef menu | Craves",
  robots: { index: false, follow: false },
};

export default function ChefMenuMediaCompatibilityPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <ChefPageHeader
        eyebrow="CHEF MENU"
        title="Menu"
        description="Manage dishes and attach customer-facing images directly to each dish from the same menu workspace."
      />
      <div className="mt-6">
        <ChefAccessBoundary>
          <ChefMenuManager />
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
