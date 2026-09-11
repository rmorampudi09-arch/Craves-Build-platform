import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { DocumentCenter } from "@/components/document-center";

export const metadata = { title: "Chef statements | Craves", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function ChefStatementsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <ChefPageHeader eyebrow="Private documents" title="Your orders, earnings and settlement statements" description="Create dated PDF snapshots from your own recorded orders and finance entries. These statements do not initiate payouts or determine commissions, tax or settlement policy." />
      <ChefAccessBoundary><DocumentCenter mode="chef" /></ChefAccessBoundary>
    </main>
  );
}
