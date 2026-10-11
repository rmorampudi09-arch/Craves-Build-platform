import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefMenuManager } from "@/features/chef/components/chef-menu-manager";

export const metadata = {
  title: "My menu | Craves",
  robots: { index: false, follow: false },
};

export default function ChefMenuPage() {
  // Narrow list; on wide screens the dish form gets room for its customer preview.
  return (
    <main className="chef-page is-narrow lg:!max-w-[66rem]">
      <ChefAccessBoundary>
        <ChefMenuManager />
      </ChefAccessBoundary>
    </main>
  );
}
