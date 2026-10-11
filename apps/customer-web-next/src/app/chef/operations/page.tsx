import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefOperationsWorkspace } from "@/components/chef-operations-workspace";
import { ChefPageHeader } from "@/components/chef-page-header";

export const metadata = {
  title: "Can customers find you? | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefOperationsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Can customers find you?" back={{ href: "/chef/profile", label: "More" }} />
        <ChefOperationsWorkspace />
      </ChefAccessBoundary>
    </main>
  );
}
