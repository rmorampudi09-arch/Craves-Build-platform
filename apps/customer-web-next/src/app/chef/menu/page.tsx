import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefMenuManager } from "@/components/chef-menu-manager";

export const metadata = {
  title: "My menu | Craves",
  robots: { index: false, follow: false },
};

export default function ChefMenuPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefMenuManager />
      </ChefAccessBoundary>
    </main>
  );
}
