import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefOperationsWorkspace } from "@/components/chef-operations-workspace";
import { ChefPageHeader } from "@/components/chef-page-header";

export const metadata = {
  title: "Chef operations | Craves",
  robots: { index: false, follow: false },
};

export default function ChefOperationsPage() {
  return (
    <main className="chef-page">
      <ChefAccessBoundary>
        <ChefPageHeader
          title="Kitchen status"
          description="What customers need before they can find and order from your kitchen: your approval, documents, location, menu and photos."
        />
        <ChefOperationsWorkspace />
      </ChefAccessBoundary>
    </main>
  );
}
