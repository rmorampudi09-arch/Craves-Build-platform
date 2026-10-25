import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefDocuments } from "@/features/chef/components/chef-documents";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";

export const metadata = {
  title: "Documents & verification | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefDocumentsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Documents & verification" back={{ href: "/chef/profile", label: "More" }} />
        <ChefDocuments />
      </ChefAccessBoundary>
    </main>
  );
}
