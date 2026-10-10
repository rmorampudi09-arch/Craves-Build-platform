import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { DocumentCenter } from "@/components/document-center";

export const metadata = { title: "Chef statements | Craves", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function ChefStatementsPage() {
  return (
    <main className="chef-page">
      <ChefAccessBoundary>
        <ChefPageHeader title="Statements" description="PDF statements of your orders, earnings and payouts for any period. They’re records only and don’t change payouts or fees." back={{ href: "/chef/finance", label: "Balance & payouts" }} />
        <DocumentCenter mode="chef" />
      </ChefAccessBoundary>
    </main>
  );
}
