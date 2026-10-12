import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { DocumentCenter } from "@/features/chef-onboarding/components/document-center";

export const metadata = { title: "Statements | Craves Chef", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function ChefStatementsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Statements" description="PDF records of your orders and money, to keep or share." back={{ href: "/chef/earnings", label: "Earnings" }} />
        <DocumentCenter mode="chef" />
      </ChefAccessBoundary>
    </main>
  );
}
