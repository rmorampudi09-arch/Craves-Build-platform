import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { DocumentCenter } from "@/components/document-center";

export const metadata = { title: "Statements | Craves Chef", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function ChefStatementsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Statements" description="PDF records of your orders and money, to keep or share." back={{ href: "/chef/finance", label: "Balance & payouts" }} />
        <DocumentCenter mode="chef" />
      </ChefAccessBoundary>
    </main>
  );
}
