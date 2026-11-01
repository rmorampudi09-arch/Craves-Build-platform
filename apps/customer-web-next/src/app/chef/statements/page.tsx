import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefLedgerStatementPanel } from "@/features/chef/components/chef-ledger-statement-panel";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { DocumentCenter } from "@/features/chef-onboarding/components/document-center";

export const metadata = { title: "Statements | Craves Chef", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Every PDF is made here; the on-screen money summary sits under the PDF maker.
export default function ChefStatementsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Statements" description="PDF records of your orders and money, to keep or share." back={{ href: "/chef/earnings", label: "Earnings" }} />
        <div className="chef-stack">
          <DocumentCenter mode="chef" />
          <ChefLedgerStatementPanel />
        </div>
      </ChefAccessBoundary>
    </main>
  );
}
