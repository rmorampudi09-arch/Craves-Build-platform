import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefMenuManager } from "@/components/chef-menu-manager";

export const metadata = {
  title: "My menu | Craves",
  robots: { index: false, follow: false },
};

export default function ChefMenuPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <ChefAccessBoundary>
        <ChefMenuManager />
      </ChefAccessBoundary>
    </main>
  );
}
